"""Validate the RC7 Skyknot dragon GLB with Blender's glTF importer."""

from __future__ import annotations

import argparse
import json
import math
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

REQUIRED_MATERIALS = (
    "M_Dragon_Scale",
    "M_Dragon_Membrane",
    "M_Dragon_Glow",
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
    smooth_polygons = 0
    invalid_meshes: list[str] = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        primitives += max(1, len(obj.data.materials))
        if len(obj.data.color_attributes) > 0:
            vertex_color_meshes += 1
        smooth_polygons += sum(
            1 for polygon in obj.data.polygons if polygon.use_smooth
        )
        if len(obj.data.vertices) == 0 or len(obj.data.polygons) == 0:
            invalid_meshes.append(f"{obj.name}: empty mesh")
        for vertex in obj.data.vertices:
            normal = vertex.normal
            if not all(math.isfinite(value) for value in normal):
                invalid_meshes.append(f"{obj.name}: non-finite normal")
                break
            if normal.length_squared < 0.5:
                invalid_meshes.append(f"{obj.name}: degenerate normal")
                break

    invalid_transforms = [
        obj.name
        for obj in bpy.data.objects
        if not all(
            math.isfinite(value)
            for row in obj.matrix_world
            for value in row
        )
    ]

    missing_nodes = [name for name in REQUIRED_NODES if bpy.data.objects.get(name) is None]
    errors: list[str] = []
    if not 18_000 <= triangles <= 20_500:
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

    materials = sorted(
        {
            material.name
            for obj in meshes
            for material in obj.data.materials
            if material is not None
        }
    )
    missing_materials = [
        name for name in REQUIRED_MATERIALS if name not in materials
    ]
    if missing_materials:
        errors.append("missing RC7 materials: " + ", ".join(missing_materials))
    if len(materials) > 3:
        errors.append(f"material budget exceeded: {len(materials)}")
    if smooth_polygons == 0:
        errors.append("smooth normals missing")
    if invalid_meshes:
        errors.append("invalid meshes: " + ", ".join(invalid_meshes))
    if invalid_transforms:
        errors.append(
            "non-finite transforms: " + ", ".join(invalid_transforms)
        )

    root = bpy.data.objects.get("DragonRoot")
    asset_version = None if root is None else root.get("asset_version")
    if asset_version != "0.7":
        errors.append(f"unexpected asset version: {asset_version}")
    asset_license = None if root is None else root.get("asset_license")
    if asset_license != "project-authored":
        errors.append(f"unexpected asset license: {asset_license}")
    anatomy_contract = None if root is None else root.get("anatomy_contract")
    if anatomy_contract != "rc7-flight-athlete-v1":
        errors.append(f"unexpected anatomy contract: {anatomy_contract}")
    edge_treatment = None if root is None else root.get("edge_treatment")
    if edge_treatment != "bevel-and-smooth-normals":
        errors.append(f"unexpected edge treatment: {edge_treatment}")
    runtime_rig = None if root is None else root.get("runtime_rig")
    if runtime_rig != "wing-head-tail-expression-pivots-v3":
        errors.append(f"unexpected runtime rig: {runtime_rig}")
    material_contract = (
        None if root is None else root.get("material_contract")
    )
    if material_contract != "scale-membrane-glow-v1":
        errors.append(f"unexpected material contract: {material_contract}")
    render_mesh_target = (
        None if root is None else root.get("render_mesh_target")
    )
    if render_mesh_target != 12:
        errors.append(f"unexpected render mesh target: {render_mesh_target}")

    report = {
        "file": str(source),
        "bytes": source.stat().st_size,
        "triangles": triangles,
        "render_meshes": len(meshes),
        "primitives": primitives,
        "materials": materials,
        "vertex_color_meshes": vertex_color_meshes,
        "smooth_polygons": smooth_polygons,
        "invalid_meshes": invalid_meshes,
        "invalid_transforms": invalid_transforms,
        "required_nodes": list(REQUIRED_NODES),
        "expression_nodes": list(EXPRESSION_NODES),
        "asset_version": asset_version,
        "asset_license": asset_license,
        "anatomy_contract": anatomy_contract,
        "edge_treatment": edge_treatment,
        "runtime_rig": runtime_rig,
        "material_contract": material_contract,
        "render_mesh_target": render_mesh_target,
        "errors": errors,
    }
    print("DRAGON_GLTF_REPORT=" + json.dumps(report, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
