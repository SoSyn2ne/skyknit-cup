"""Export the RC7 Skyknot dragon with runtime pivot groups.

Run Blender with the source .blend already open and pass the output after `--`:
blender source.blend --background --python export_dragon_glb.py -- --output model.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    return parser.parse_args(arguments)


def create_pivot(
    name: str,
    world_location: tuple[float, float, float],
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    pivot = bpy.data.objects.new(name, None)
    collection.objects.link(pivot)
    pivot.empty_display_type = "PLAIN_AXES"
    pivot.empty_display_size = 0.35
    pivot.parent = parent
    pivot.matrix_world = Matrix.Translation(Vector(world_location))
    return pivot


def reparent_preserving_world(
    child: bpy.types.Object, parent: bpy.types.Object
) -> None:
    world_matrix = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world_matrix


def group_named_parts(
    parent: bpy.types.Object, predicate: callable[[str], bool]
) -> None:
    for obj in tuple(bpy.data.objects):
        if obj.type == "MESH" and predicate(obj.name):
            reparent_preserving_world(obj, parent)


def merge_direct_mesh_children(
    parent: bpy.types.Object, merged_name: str
) -> None:
    meshes = [child for child in parent.children if child.type == "MESH"]
    if not meshes:
        return

    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = merged_name
    merged.data.name = f"{merged_name}_Mesh"
    reparent_preserving_world(merged, parent)


def merge_runtime_meshes(root: bpy.types.Object) -> None:
    merge_direct_mesh_children(root, "Dragon_Body")
    merge_direct_mesh_children(
        bpy.data.objects["WingRig_L"], "Dragon_Wing_L"
    )
    merge_direct_mesh_children(
        bpy.data.objects["WingRig_R"], "Dragon_Wing_R"
    )
    merge_direct_mesh_children(bpy.data.objects["HeadRig"], "Dragon_Head")
    merge_direct_mesh_children(bpy.data.objects["JawRig"], "Dragon_Jaw")
    merge_direct_mesh_children(
        bpy.data.objects["EyeRig_L"], "Dragon_Eye_L"
    )
    merge_direct_mesh_children(
        bpy.data.objects["EyeRig_R"], "Dragon_Eye_R"
    )
    for index in range(1, 6):
        merge_direct_mesh_children(
            bpy.data.objects[f"TailRig_{index}"],
            f"Dragon_Tail_{index}",
        )


def apply_export_modifiers() -> None:
    for obj in tuple(bpy.data.objects):
        if obj.type != "MESH" or len(obj.modifiers) == 0:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in tuple(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)


def consolidate_runtime_materials() -> None:
    base_source = bpy.data.materials.get("M_Dragon_Ember")
    membrane_source = bpy.data.materials.get("M_Wing_Membrane")
    glow_source = bpy.data.materials.get("M_Rune_Teal")
    if base_source is None or membrane_source is None or glow_source is None:
        raise RuntimeError("Dragon source materials are incomplete")

    base = base_source.copy()
    base.name = "M_Dragon_Scale"
    base.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    base["vertex_palette"] = (
        "ember-ember-light-burgundy-gold-charcoal"
    )

    membrane = membrane_source.copy()
    membrane.name = "M_Dragon_Membrane"
    membrane.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    membrane["vertex_palette"] = "sunrise-amber-gradient"

    glow = glow_source.copy()
    glow.name = "M_Dragon_Glow"
    glow.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    glow["vertex_palette"] = "teal"

    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        source_name = obj.data.materials[0].name
        uses_glow = source_name.startswith("M_Rune_Teal")
        uses_membrane = source_name.startswith("M_Wing_Membrane")
        obj.data.materials.clear()
        if uses_glow:
            obj.data.materials.append(glow)
        elif uses_membrane:
            obj.data.materials.append(membrane)
        else:
            obj.data.materials.append(base)


def build_runtime_hierarchy(root: bpy.types.Object) -> None:
    collection = root.users_collection[0]

    left_wing = create_pivot(
        "WingRig_L", (-0.68, 0.48, 3.16), root, collection
    )
    right_wing = create_pivot(
        "WingRig_R", (0.68, 0.48, 3.16), root, collection
    )
    group_named_parts(left_wing, lambda name: name.startswith("Wing_L_"))
    group_named_parts(right_wing, lambda name: name.startswith("Wing_R_"))

    head = create_pivot("HeadRig", (0.0, 2.40, 4.48), root, collection)
    jaw = create_pivot("JawRig", (0.0, 3.23, 4.22), head, collection)
    group_named_parts(jaw, lambda name: name.startswith("Jaw_"))

    left_eye = create_pivot(
        "EyeRig_L", (-0.33, 3.49, 4.63), head, collection
    )
    right_eye = create_pivot(
        "EyeRig_R", (0.33, 3.49, 4.63), head, collection
    )
    group_named_parts(left_eye, lambda name: name.startswith("Eye_L_"))
    group_named_parts(right_eye, lambda name: name.startswith("Eye_R_"))

    head_prefixes = (
        "Head_",
        "Horn_",
        "EyeSocket_",
        "Brow_",
        "CheekSpike_",
        "Nostril_",
    )
    group_named_parts(head, lambda name: name.startswith(head_prefixes))

    tail_starts = (
        (0.0, -1.72, 2.30),
        (0.0, -2.68, 2.16),
        (0.0, -3.66, 2.02),
        (0.0, -4.65, 1.95),
        (0.0, -5.63, 1.98),
    )
    tail_parent = root
    for index, location in enumerate(tail_starts, start=1):
        pivot = create_pivot(
            f"TailRig_{index}", location, tail_parent, collection
        )
        tail_mesh = bpy.data.objects.get(f"Tail_{index}")
        if tail_mesh is not None:
            reparent_preserving_world(tail_mesh, pivot)
        dorsal_spine = bpy.data.objects.get(f"DorsalSpine_{index + 6}")
        if dorsal_spine is not None:
            reparent_preserving_world(dorsal_spine, pivot)
        tail_parent = pivot

    tail_end_prefixes = ("TailFin_",)
    group_named_parts(
        tail_parent, lambda name: name.startswith(tail_end_prefixes)
    )

    root["runtime_rig"] = "wing-head-tail-expression-pivots-v3"
    root["asset_license"] = "project-authored"
    root["material_contract"] = "scale-membrane-glow-v1"
    merge_runtime_meshes(root)
    root["render_mesh_target"] = 12


def export_glb(output: Path) -> None:
    root = bpy.data.objects.get("DragonRoot")
    if root is None:
        raise RuntimeError("DragonRoot was not found in the source blend")

    apply_export_modifiers()
    consolidate_runtime_materials()
    build_runtime_hierarchy(root)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )
    print(f"DRAGON_EXPORT={output}")


def main() -> None:
    args = parse_args()
    export_glb(Path(args.output).resolve())


if __name__ == "__main__":
    main()
