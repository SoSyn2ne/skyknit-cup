"""Inspect Milestone 37/38 runtime GLBs with Blender's glTF importer.

The report covers hierarchy, authoring metadata, budgets, vertex colors,
finite transforms/normals, profile proportions, gzip-9 bytes and SHA-256.
Pass every shipping character and accessory in one invocation so the command
acts as the reproducible release gate for the complete customization set.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy


REQUIRED_CHARACTER_NODES = (
    "DragonRoot",
    "WingRig_L",
    "WingRig_R",
    "HeadRig",
    "TailRig_1",
    "TailRig_2",
    "TailRig_3",
    "TailRig_4",
    "TailRig_5",
)

EXPRESSION_NODES = ("JawRig", "EyeRig_L", "EyeRig_R")
ROLE_MATERIALS = (
    "M_Dragon_Glow",
    "M_Dragon_Membrane",
    "M_Dragon_Scale",
)

CHARACTER_TRIANGLE_BUDGETS = {
    "ember-phoenix": (22_000, 28_000),
    "storm-white-tiger": (24_000, 30_000),
}

GUARDIAN_PROFILE_BOUNDS = {
    "ember-phoenix": {
        "width": (11.90, 12.15),
        "length": (11.75, 12.00),
        "height": (5.29, 5.41),
        "features": (
            "continuous-avian-loft",
            "three-feather-layers",
            "three-forward-hallux-talons",
            "triple-cambered-tail-plumes",
        ),
    },
    "storm-white-tiger": {
        "width": (11.65, 11.90),
        "length": (8.77, 8.95),
        "height": (3.69, 3.78),
        "features": (
            "continuous-feline-loft",
            "rounded-ears",
            "four-digitigrade-limbs",
            "articulated-paws",
            "vertex-color-stripes",
        ),
    },
}


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", action="append", required=True)
    parser.add_argument("--report")
    return parser.parse_args(arguments)


def clear_imported_data() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def find_root() -> tuple[str, bpy.types.Object]:
    character_root = bpy.data.objects.get("DragonRoot")
    if character_root is not None:
        return "character", character_root
    accessory_roots = [
        obj
        for obj in bpy.data.objects
        if obj.parent is None and obj.get("accessory_origin") == "socket-local"
    ]
    if len(accessory_roots) != 1:
        raise RuntimeError("Imported GLB has no unambiguous runtime root")
    return "accessory", accessory_roots[0]


def compressed_size(source: Path) -> int:
    return len(gzip.compress(source.read_bytes(), compresslevel=9, mtime=0))


def world_bounds(meshes: list[bpy.types.Object]) -> dict[str, list[float]]:
    points = [
        obj.matrix_world @ vertex.co
        for obj in meshes
        for vertex in obj.data.vertices
    ]
    if not points:
        return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "size": [0.0, 0.0, 0.0]}
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    size = [maximum[axis] - minimum[axis] for axis in range(3)]
    return {
        "min": [round(value, 5) for value in minimum],
        "max": [round(value, 5) for value in maximum],
        "size": [round(value, 5) for value in size],
    }


def finite_matrix(obj: bpy.types.Object) -> bool:
    return all(math.isfinite(value) for row in obj.matrix_world for value in row)


def inspect_one(source: Path) -> dict[str, object]:
    if not source.exists():
        raise FileNotFoundError(source)
    clear_imported_data()
    bpy.ops.import_scene.gltf(filepath=str(source))
    kind, root = find_root()
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    errors: list[str] = []
    triangles = 0
    primitives = 0
    invalid_meshes: list[str] = []
    vertex_color_meshes = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        primitives += max(1, len(obj.data.materials))
        if len(obj.data.color_attributes) > 0:
            vertex_color_meshes += 1
        if not obj.data.vertices or not obj.data.polygons:
            invalid_meshes.append(f"{obj.name}: empty mesh")
            continue
        for vertex in obj.data.vertices:
            if not all(math.isfinite(component) for component in vertex.normal):
                invalid_meshes.append(f"{obj.name}: non-finite normal")
                break
            if vertex.normal.length_squared < 0.5:
                invalid_meshes.append(f"{obj.name}: degenerate normal")
                break
            world = obj.matrix_world @ vertex.co
            if not all(math.isfinite(component) for component in world):
                invalid_meshes.append(f"{obj.name}: non-finite position")
                break
    invalid_transforms = [obj.name for obj in bpy.data.objects if not finite_matrix(obj)]
    materials = sorted(
        {
            material.name
            for obj in meshes
            for material in obj.data.materials
            if material is not None
        }
    )
    bounds = world_bounds(meshes)
    gzip_bytes = compressed_size(source)
    sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
    asset_id = root.get("asset_id")
    if not isinstance(asset_id, str):
        asset_id = source.stem.removeprefix("skyknit-")

    if root.get("asset_license") != "project-authored":
        errors.append("asset_license must be project-authored")
    if invalid_meshes:
        errors.append("invalid meshes: " + ", ".join(invalid_meshes))
    if invalid_transforms:
        errors.append("non-finite transforms: " + ", ".join(invalid_transforms))
    if vertex_color_meshes != len(meshes):
        errors.append(f"vertex colors missing: {vertex_color_meshes}/{len(meshes)}")

    if kind == "character":
        missing_nodes = [
            name for name in REQUIRED_CHARACTER_NODES if bpy.data.objects.get(name) is None
        ]
        if missing_nodes:
            errors.append("missing runtime nodes: " + ", ".join(missing_nodes))
        missing_expression = [
            name for name in EXPRESSION_NODES if bpy.data.objects.get(name) is None
        ]
        if missing_expression:
            errors.append("missing expression nodes: " + ", ".join(missing_expression))
        triangle_minimum, triangle_maximum = CHARACTER_TRIANGLE_BUDGETS.get(
            asset_id, (18_000, 20_500)
        )
        if not triangle_minimum <= triangles <= triangle_maximum:
            errors.append(
                "triangles out of range "
                f"{triangle_minimum}-{triangle_maximum}: {triangles}"
            )
        if len(meshes) > 14:
            errors.append(f"render mesh budget exceeded: {len(meshes)}")
        if primitives > 18:
            errors.append(f"primitive budget exceeded: {primitives}")
        if tuple(materials) != ROLE_MATERIALS:
            errors.append("role materials mismatch: " + ", ".join(materials))
        gzip_budget = 600 * 1024 if asset_id in GUARDIAN_PROFILE_BOUNDS else 450 * 1024
        if gzip_bytes > gzip_budget:
            errors.append(f"gzip-9 budget exceeded: {gzip_bytes}")
        if asset_id in {
            "ember-phoenix",
            "storm-white-tiger",
            "storm-griffin",
            "cloud-manta",
        }:
            for socket in (
                "AccessorySocket_Head",
                "AccessorySocket_Back",
                "AccessorySocket_Tail",
            ):
                if bpy.data.objects.get(socket) is None:
                    errors.append(f"missing accessory socket: {socket}")
            features = str(root.get("silhouette_features", "")).lower()
            profile = GUARDIAN_PROFILE_BOUNDS.get(asset_id)
            if profile is not None:
                minimum_z = float(bounds["min"][2])
                if not 0.02 <= minimum_z <= 0.06:
                    errors.append(f"landing minimum Z out of range: {minimum_z}")
                dimensions = {
                    "width": float(bounds["size"][0]),
                    "length": float(bounds["size"][1]),
                    "height": float(bounds["size"][2]),
                }
                for dimension, value in dimensions.items():
                    minimum, maximum = profile[dimension]
                    if not minimum <= value <= maximum:
                        errors.append(
                            f"{dimension} out of range {minimum}-{maximum}: {value}"
                        )
                for feature in profile["features"]:
                    if feature not in features:
                        errors.append(f"guardian silhouette metadata lacks {feature}")
            elif asset_id == "storm-griffin":
                if "beak" not in features or "feather" not in features:
                    errors.append("griffin silhouette metadata lacks beak/feather features")
                width = max(float(bounds["size"][0]), float(bounds["size"][1]))
                height = float(bounds["size"][2])
                if width <= 0.0 or height / width < 0.30:
                    errors.append("griffin profile is not vertically distinct")
            else:
                if not all(term in features for term in ("flat", "fin", "whip")):
                    errors.append("manta silhouette metadata lacks flat/fin/whip features")
                width = max(float(bounds["size"][0]), float(bounds["size"][1]))
                height = float(bounds["size"][2])
                if width <= 0.0 or height / width > 0.28:
                    errors.append("manta profile is not sufficiently flat")
    else:
        if triangles <= 0 or triangles > 3_000:
            errors.append(f"accessory triangles out of range: {triangles}")
        if len(meshes) > 2:
            errors.append(f"accessory mesh budget exceeded: {len(meshes)}")
        if primitives > 2:
            errors.append(f"accessory primitive budget exceeded: {primitives}")
        if len(materials) > 2:
            errors.append(f"accessory material budget exceeded: {len(materials)}")
        if gzip_bytes > 100 * 1024:
            errors.append(f"accessory gzip-9 budget exceeded: {gzip_bytes}")
        expected_socket = {
            "wind-goggles": "AccessorySocket_Head",
            "festival-ribbon": "AccessorySocket_Tail",
        }.get(asset_id)
        if expected_socket is not None and root.get("attachment_socket") != expected_socket:
            errors.append(f"unexpected attachment socket: {root.get('attachment_socket')}")

    return {
        "asset_id": asset_id,
        "kind": kind,
        "file": str(source),
        "bytes": source.stat().st_size,
        "gzip_9_bytes": gzip_bytes,
        "sha256": sha256,
        "triangles": triangles,
        "render_meshes": len(meshes),
        "primitives": primitives,
        "materials": materials,
        "vertex_color_meshes": vertex_color_meshes,
        "bounds": bounds,
        "asset_license": root.get("asset_license"),
        "runtime_rig": root.get("runtime_rig"),
        "silhouette_features": root.get("silhouette_features"),
        "invalid_meshes": invalid_meshes,
        "invalid_transforms": invalid_transforms,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    reports = [inspect_one(Path(value).resolve()) for value in args.input]
    result = {
        "blender_version": bpy.app.version_string,
        "assets": reports,
        "errors": [
            f"{report['asset_id']}: {error}"
            for report in reports
            for error in report["errors"]
        ],
    }
    if args.report:
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("CHARACTER_GLTF_REPORT=" + json.dumps(result, separators=(",", ":")))
    if result["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
