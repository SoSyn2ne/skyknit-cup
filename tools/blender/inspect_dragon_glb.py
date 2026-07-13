"""Validate the RC3 Skyknot dragon GLB with Blender's glTF importer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


REQUIRED_NODES = (
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

EXPRESSION_NODES = (
    "JawRig",
    "EyeRig_L",
    "EyeRig_R",
)


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    return parser.parse_args(arguments)


def main() -> None:
    source = Path(parse_args().input).resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))

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

    missing_nodes = [name for name in REQUIRED_NODES if bpy.data.objects.get(name) is None]
    errors: list[str] = []
    if not 18_000 <= triangles <= 22_000:
        errors.append(f"triangles out of range: {triangles}")
    if len(meshes) > 14:
        errors.append(f"render mesh budget exceeded: {len(meshes)}")
    if primitives > 18:
        errors.append(f"primitive budget exceeded: {primitives}")
    if vertex_color_meshes != len(meshes):
        errors.append(
            f"vertex colors missing: {vertex_color_meshes}/{len(meshes)} meshes"
        )
    if missing_nodes:
        errors.append("missing runtime nodes: " + ", ".join(missing_nodes))
    missing_expression_nodes = [
        name
        for name in EXPRESSION_NODES
        if bpy.data.objects.get(name) is None
    ]
    if missing_expression_nodes:
        errors.append(
            "missing expression nodes: " + ", ".join(missing_expression_nodes)
        )

    root = bpy.data.objects.get("DragonRoot")
    asset_version = None if root is None else root.get("asset_version")
    if asset_version != "0.3":
        errors.append(f"unexpected asset version: {asset_version}")

    report = {
        "file": str(source),
        "bytes": source.stat().st_size,
        "triangles": triangles,
        "render_meshes": len(meshes),
        "primitives": primitives,
        "materials": sorted(
            {
                material.name
                for obj in meshes
                for material in obj.data.materials
                if material is not None
            }
        ),
        "vertex_color_meshes": vertex_color_meshes,
        "required_nodes": list(REQUIRED_NODES),
        "expression_nodes": list(EXPRESSION_NODES),
        "asset_version": asset_version,
        "errors": errors,
    }
    print("DRAGON_GLTF_REPORT=" + json.dumps(report, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
