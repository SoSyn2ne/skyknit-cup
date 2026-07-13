"""Validate RC5 world GLBs through Blender's glTF importer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSET_ROOT = ROOT / "public" / "assets" / "models" / "world"
REPORT_PATH = ROOT / "artifacts" / "world-rc5" / "world-glb-report.json"

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
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        primitives += max(1, len(obj.data.materials))
        if len(obj.data.color_attributes) > 0:
            vertex_color_meshes += 1

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
    if missing_nodes:
        errors.append("missing nodes: " + ", ".join(missing_nodes))
    if root is None:
        asset_version = None
        asset_license = None
        root_region = None
        root_lod = None
    else:
        asset_version = root.get("asset_version")
        asset_license = root.get("asset_license")
        root_region = root.get("region_id")
        root_lod = root.get("lod")
    if asset_version != "0.5":
        errors.append(f"unexpected asset version: {asset_version}")
    if asset_license != "project-authored":
        errors.append(f"unexpected asset license: {asset_license}")
    if root_region != region_id:
        errors.append(f"unexpected region id: {root_region}")
    if root_lod != lod:
        errors.append(f"unexpected lod: {root_lod}")

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
        "required_nodes": list(required_nodes),
        "asset_version": asset_version,
        "asset_license": asset_license,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
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

    result = {
        "asset_version": "0.5",
        "asset_root": str(asset_root),
        "reports": reports,
        "errors": errors,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf8",
    )
    print("WORLD_GLTF_REPORT=" + json.dumps(result, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
