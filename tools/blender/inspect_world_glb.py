"""Validate RC7 world GLBs through Blender's glTF importer."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSET_ROOT = ROOT / "public" / "assets" / "models" / "world"
ASSET_VERSION = "0.7"
GEOMETRY_STYLE = "handcrafted-layered"

LANDING_PAD_ORIGINS = {
    "festival-hub": (0.0, 0.0, -3.15),
    "wind-canyon": (0.0, -4.0, -14.0),
    "cloud-ruins": (0.0, 0.0, -3.55),
}

SEMANTIC_ORIGINS = {
    "festival-hub": {
        "FestivalAirfield": (0.0, 0.0, -12.0),
        "FestivalTower": (-18.0, 14.0, 2.3),
        "FestivalFlags": (33.6673, 4.7445, 3.4),
        "RaceArch": (25.8, 10.0, 5.0),
    },
    "wind-canyon": {
        "CanyonCliffs": (-38.0, -68.0, -22.0),
        "WindTunnel": (22.0, 34.0, -8.0),
        "BrokenBridge": (-38.0, -34.0, -2.5),
    },
    "cloud-ruins": {
        "CloudTemple": (36.0, 0.0, -11.0),
        "RunePillars": (29.0, 0.0, 2.8),
        "TempleSteps": (0.0, 12.0, -3.8),
        "FloatingSlabs": (25.0, 0.0, 14.0),
    },
}

REGION_NODES = {
    "festival-hub": (
        "FestivalAirfield",
        "FestivalTower",
        "FestivalFlags",
        "RaceArch",
    ),
    "wind-canyon": (
        "CanyonCliffs",
        "WindTunnel",
        "BrokenBridge",
    ),
    "cloud-ruins": (
        "CloudTemple",
        "RunePillars",
        "TempleSteps",
        "FloatingSlabs",
    ),
}


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ASSET_ROOT))
    parser.add_argument("--region", choices=tuple(REGION_NODES))
    parser.add_argument(
        "--scope",
        default=os.environ.get("DRAGON_QA_SCOPE", "rc7"),
    )
    return parser.parse_args(arguments)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def inspect_asset(path: Path, region_id: str, lod: str) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = 0
    primitives = 0
    vertex_color_meshes = 0
    varied_vertex_color_meshes = 0
    invalid_normal_meshes: list[str] = []
    non_finite_transform_nodes: list[str] = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        primitives += max(1, len(obj.data.materials))
        if len(obj.data.color_attributes) > 0:
            vertex_color_meshes += 1
            colors = {
                tuple(round(float(channel), 3) for channel in item.color[:3])
                for attribute in obj.data.color_attributes
                for item in attribute.data
            }
            if len(colors) >= 3:
                varied_vertex_color_meshes += 1
        if any(
            not all(math.isfinite(float(channel)) for channel in vertex.normal)
            or vertex.normal.length_squared < 0.5
            for vertex in obj.data.vertices
        ):
            invalid_normal_meshes.append(obj.name)

    for obj in bpy.data.objects:
        if not all(
            math.isfinite(float(value))
            for row in obj.matrix_world
            for value in row
        ):
            non_finite_transform_nodes.append(obj.name)

    root = bpy.data.objects.get("RegionRoot")
    required_nodes = ("RegionRoot", "LandingPad", *REGION_NODES[region_id])
    missing_nodes = [
        node for node in required_nodes if bpy.data.objects.get(node) is None
    ]
    materials = sorted(
        {
            material.name
            for obj in meshes
            for material in obj.data.materials
            if material is not None
        }
    )
    errors: list[str] = []
    minimum_triangles = 12_000 if lod == "high" else 3_000
    maximum_triangles = 60_000 if lod == "high" else 25_000
    if not minimum_triangles <= triangles <= maximum_triangles:
        errors.append(f"triangles out of range: {triangles}")
    if primitives > 12:
        errors.append(f"primitive budget exceeded: {primitives}")
    if len(materials) > 8:
        errors.append(f"material budget exceeded: {len(materials)}")
    if vertex_color_meshes != len(meshes):
        errors.append(
            f"vertex colors missing: {vertex_color_meshes}/{len(meshes)}"
        )
    if varied_vertex_color_meshes != len(meshes):
        errors.append(
            "vertex color variation missing: "
            f"{varied_vertex_color_meshes}/{len(meshes)}"
        )
    if invalid_normal_meshes:
        errors.append("invalid normals: " + ", ".join(invalid_normal_meshes))
    if non_finite_transform_nodes:
        errors.append(
            "non-finite transforms: " + ", ".join(non_finite_transform_nodes)
        )
    if missing_nodes:
        errors.append("missing nodes: " + ", ".join(missing_nodes))
    if root is None:
        asset_version = None
        asset_license = None
        root_region = None
        root_lod = None
        geometry_style = None
    else:
        asset_version = root.get("asset_version")
        asset_license = root.get("asset_license")
        root_region = root.get("region_id")
        root_lod = root.get("lod")
        geometry_style = root.get("geometry_style")
    if asset_version != ASSET_VERSION:
        errors.append(f"unexpected asset version: {asset_version}")
    if asset_license != "project-authored":
        errors.append(f"unexpected asset license: {asset_license}")
    if root_region != region_id:
        errors.append(f"unexpected region id: {root_region}")
    if root_lod != lod:
        errors.append(f"unexpected lod: {root_lod}")
    if geometry_style != GEOMETRY_STYLE:
        errors.append(f"unexpected geometry style: {geometry_style}")

    if root is not None:
        root_transform = (*root.location, *root.rotation_euler, *root.scale)
        expected_root_transform = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
        if any(
            abs(float(actual) - expected) > 1e-4
            for actual, expected in zip(root_transform, expected_root_transform)
        ):
            errors.append("RegionRoot transform contract changed")

    landing_pad = bpy.data.objects.get("LandingPad")
    landing_pad_origin = None
    if landing_pad is not None:
        landing_pad_origin = tuple(round(float(value), 4) for value in landing_pad.location)
        if any(
            abs(actual - expected) > 1e-3
            for actual, expected in zip(
                landing_pad_origin, LANDING_PAD_ORIGINS[region_id]
            )
        ):
            errors.append(
                f"LandingPad origin changed: {landing_pad_origin}"
            )

    styled_nodes = [
        node
        for node in REGION_NODES[region_id]
        if (obj := bpy.data.objects.get(node)) is not None
        and obj.get("geometry_style") == GEOMETRY_STYLE
    ]
    if len(styled_nodes) != len(REGION_NODES[region_id]):
        errors.append(
            "authored style metadata missing: "
            f"{len(styled_nodes)}/{len(REGION_NODES[region_id])}"
        )

    semantic_origins: dict[str, tuple[float, float, float]] = {}
    for node, expected_origin in SEMANTIC_ORIGINS[region_id].items():
        obj = bpy.data.objects.get(node)
        if obj is None:
            continue
        actual_origin = tuple(round(float(value), 4) for value in obj.location)
        semantic_origins[node] = actual_origin
        if any(
            abs(actual - expected) > 1e-3
            for actual, expected in zip(actual_origin, expected_origin)
        ):
            errors.append(f"{node} origin changed: {actual_origin}")

    return {
        "file": str(path),
        "bytes": path.stat().st_size,
        "region": region_id,
        "lod": lod,
        "triangles": triangles,
        "render_meshes": len(meshes),
        "primitives": primitives,
        "materials": materials,
        "vertex_color_meshes": vertex_color_meshes,
        "varied_vertex_color_meshes": varied_vertex_color_meshes,
        "invalid_normal_meshes": invalid_normal_meshes,
        "non_finite_transform_nodes": non_finite_transform_nodes,
        "required_nodes": list(required_nodes),
        "asset_version": asset_version,
        "asset_license": asset_license,
        "geometry_style": geometry_style,
        "landing_pad_origin": landing_pad_origin,
        "semantic_origins": semantic_origins,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    scope = args.scope.strip() or "rc7"
    if not all(character.isalnum() or character in "-_" for character in scope):
        raise SystemExit(f"invalid artifact scope: {scope}")
    asset_root = Path(args.root).resolve()
    regions = (args.region,) if args.region else tuple(REGION_NODES)
    reports: list[dict[str, object]] = []
    errors: list[str] = []

    for region_id in regions:
        for lod in ("high", "low"):
            path = asset_root / f"{region_id}-{lod}.glb"
            if not path.exists():
                errors.append(f"missing file: {path}")
                continue
            report = inspect_asset(path, region_id, lod)
            reports.append(report)
            errors.extend(
                f"{path.name}: {message}"
                for message in report["errors"]
            )

    for region_id in regions:
        pair = [report for report in reports if report["region"] == region_id]
        high = next((item for item in pair if item["lod"] == "high"), None)
        low = next((item for item in pair if item["lod"] == "low"), None)
        if high is not None and low is not None:
            if int(low["triangles"]) >= int(high["triangles"]):
                errors.append(f"{region_id}: low LOD is not smaller than high")
            if int(low["bytes"]) >= int(high["bytes"]):
                errors.append(
                    f"{region_id}: low LOD file is not smaller than high"
                )

    result = {
        "scope": scope,
        "asset_version": ASSET_VERSION,
        "asset_root": str(asset_root),
        "reports": reports,
        "errors": errors,
    }
    report_name = (
        f"world-glb-report-{args.region}.json"
        if args.region
        else "world-glb-report.json"
    )
    report_path = ROOT / "artifacts" / f"world-{scope}" / report_name
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf8",
    )
    print("WORLD_GLTF_REPORT=" + json.dumps(result, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
