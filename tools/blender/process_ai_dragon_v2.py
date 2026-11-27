"""Post-process an AI-generated 3D dragon mesh (Tripo / Meshy / Rodin / VARCO) in Blender 4.5.

Normalizes axes/scale, enforces triangle budgets via collapse decimation, attaches
the runtime semantic rig hierarchy (`DragonRoot`, `HeadRig`, `JawRig`, `EyeRig_L/R`,
`WingRig_L/R`, `LegRig_Fore/Hind_L/R`, `TailRig_1..5`), exports a GLB, and runs
a full re-import geometry + PBR material/texture audit.
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dragon_blockout import clear_file, make_collection

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/art-v2"

SEMANTIC_RIG_LAYOUT: tuple[tuple[str, str | None, tuple[float, float, float]], ...] = (
    ("DragonRoot", None, (0.0, 0.0, 0.0)),
    ("HeadRig", "DragonRoot", (0.0, 2.35, 4.57)),
    ("JawRig", "HeadRig", (0.0, 2.82, 4.30)),
    ("EyeRig_L", "HeadRig", (-0.56, 3.05, 4.82)),
    ("EyeRig_R", "HeadRig", (0.56, 3.05, 4.82)),
    ("WingRig_L", "DragonRoot", (-0.68, 0.42, 3.12)),
    ("WingRig_R", "DragonRoot", (0.68, 0.42, 3.12)),
    ("LegRig_Fore_L", "DragonRoot", (-0.68, 0.74, 2.74)),
    ("LegRig_Hind_L", "DragonRoot", (-0.67, -1.55, 2.46)),
    ("LegRig_Fore_R", "DragonRoot", (0.68, 0.74, 2.74)),
    ("LegRig_Hind_R", "DragonRoot", (0.67, -1.55, 2.46)),
    ("TailRig_1", "DragonRoot", (0.0, -2.28, 2.37)),
    ("TailRig_2", "TailRig_1", (0.0, -3.34, 2.22)),
    ("TailRig_3", "TailRig_2", (0.10, -4.46, 2.05)),
    ("TailRig_4", "TailRig_3", (0.25, -5.60, 1.96)),
    ("TailRig_5", "TailRig_4", (0.42, -6.72, 2.14)),
)


def import_raw_mesh(filepath: Path) -> None:
    suffix = filepath.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(filepath))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(filepath))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(filepath))
    else:
        raise ValueError(f"Unsupported 3D input format: {suffix}")
    bpy.context.view_layer.update()


def world_bounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    if not corners:
        raise RuntimeError("No mesh geometry found in imported file")
    low = Vector((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
    high = Vector((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
    return low, high


def count_triangles(meshes: list[bpy.types.Object]) -> int:
    total = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def normalize_orientation_and_scale(
    meshes: list[bpy.types.Object],
    forward_axis: str,
    target_wingspan: float,
    target_base_z: float = 0.72,
) -> dict[str, list[float]]:
    rotations = {
        "+Y": Euler((0.0, 0.0, 0.0), "XYZ"),
        "-Y": Euler((0.0, 0.0, math.pi), "XYZ"),
        "+X": Euler((0.0, 0.0, -math.pi / 2), "XYZ"),
        "-X": Euler((0.0, 0.0, math.pi / 2), "XYZ"),
        "+Z": Euler((-math.pi / 2, 0.0, 0.0), "XYZ"),
        "-Z": Euler((math.pi / 2, 0.0, 0.0), "XYZ"),
    }
    rot_matrix = rotations.get(forward_axis, rotations["+Y"]).to_matrix().to_4x4()
    if forward_axis != "+Y":
        for obj in meshes:
            if obj.parent is None:
                obj.matrix_world = rot_matrix @ obj.matrix_world
        bpy.context.view_layer.update()

    low, high = world_bounds(meshes)
    span_x = max(0.001, high.x - low.x)
    scale_factor = target_wingspan / span_x
    center_x = (low.x + high.x) * 0.5
    center_y = (low.y + high.y) * 0.5 + 1.93
    translate_before = Matrix.Translation(Vector((-center_x, -center_y, -low.z)))
    scale_mat = Matrix.Diagonal(Vector((scale_factor, scale_factor, scale_factor, 1.0)))
    translate_after = Matrix.Translation(Vector((0.0, 0.0, target_base_z)))
    transform = translate_after @ scale_mat @ translate_before

    top_objects = {obj.parent if obj.parent else obj for obj in meshes}
    for obj in top_objects:
        while obj.parent is not None:
            obj = obj.parent
        obj.matrix_world = transform @ obj.matrix_world
    bpy.context.view_layer.update()
    new_low, new_high = world_bounds(meshes)
    return {"min": [round(v, 4) for v in new_low], "max": [round(v, 4) for v in new_high]}


def clear_custom_normals(mesh_data: bpy.types.Mesh) -> None:
    custom_attr = mesh_data.attributes.get("custom_normal")
    if custom_attr is not None:
        mesh_data.attributes.remove(custom_attr)


def clean_mesh_geometry(obj: bpy.types.Object) -> None:
    clear_custom_normals(obj.data)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    for _ in range(3):
        tiny_faces = [f for f in bm.faces if f.calc_area() <= 1e-8 or f.normal.length <= 0.5]
        if not tiny_faces:
            break
        bmesh.ops.delete(bm, geom=tiny_faces, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    sharp_edges = [
        e
        for e in bm.edges
        if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < -0.2
    ]
    if sharp_edges:
        bmesh.ops.split_edges(bm, edges=sharp_edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
    bad_verts = [v for v in bm.verts if v.link_faces and v.normal.length <= 0.6]
    if bad_verts:
        edges_to_split = list({e for v in bad_verts for e in v.link_edges})
        bmesh.ops.split_edges(bm, edges=edges_to_split)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
    seen_positions: dict[tuple[int, int, int], list[bmesh.types.BMVert]] = {}
    for v in bm.verts:
        if not v.link_faces:
            continue
        key = (int(round(v.co.x * 10000)), int(round(v.co.y * 10000)), int(round(v.co.z * 10000)))
        bucket = seen_positions.setdefault(key, [])
        if bucket and v.normal.length > 0.5:
            v.co += v.normal * (2e-4 * len(bucket))
        bucket.append(v)
    loose_edges = [e for e in bm.edges if not e.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_verts = [v for v in bm.verts if not v.link_faces]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    clear_custom_normals(obj.data)
    obj.data.update()


def enforce_triangle_budget(meshes: list[bpy.types.Object], target_triangles: int) -> dict[str, int]:
    before = count_triangles(meshes)
    for obj in meshes:
        clear_custom_normals(obj.data)
    if before > target_triangles:
        ratio = max(0.05, min(0.98, target_triangles / before))
        for obj in meshes:
            obj.data.calc_loop_triangles()
            if len(obj.data.loop_triangles) < 64:
                continue
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new(name="ArtV2_Decimate", type="DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for obj in meshes:
        clean_mesh_geometry(obj)
    bpy.context.view_layer.update()
    after = count_triangles(meshes)
    return {"triangles_before": before, "triangles_after": after}


def ensure_semantic_rigs(
    collection: bpy.types.Collection,
    meshes: list[bpy.types.Object],
    source_tool: str,
    license_tag: str,
) -> tuple[bpy.types.Object, dict[str, dict[str, object]]]:
    rigs: dict[str, bpy.types.Object] = {}
    for name, parent_name, pos in SEMANTIC_RIG_LAYOUT:
        existing = bpy.data.objects.get(name)
        if existing is not None and existing.type == "EMPTY":
            rig = existing
            if rig.name not in collection.objects:
                collection.objects.link(rig)
        else:
            rig = bpy.data.objects.new(name, None)
            rig.empty_display_type = "PLAIN_AXES"
            rig.empty_display_size = 0.25
            collection.objects.link(rig)
        parent = rigs[parent_name] if parent_name else None
        rig.parent = parent
        rig.matrix_world = Matrix.Translation(Vector(pos))
        rigs[name] = rig

    root = rigs["DragonRoot"]
    root["asset_version"] = "art-v2.2-ai-pipeline"
    root["source_tool"] = source_tool
    root["asset_license"] = license_tag
    root["runtime_rig"] = "rigid-art-v2-preview"
    root["forward_axis"] = "+Y"
    root["up_axis"] = "+Z"
    root["reference"] = "assets/source/art-v2/reference/dragon-v2-turnaround-sheet.png"

    for mesh_obj in meshes:
        if mesh_obj.name not in collection.objects:
            collection.objects.link(mesh_obj)
        if mesh_obj.parent is None or mesh_obj.parent.name not in rigs:
            world = mesh_obj.matrix_world.copy()
            mesh_obj.parent = root
            mesh_obj.matrix_parent_inverse = root.matrix_world.inverted()
            mesh_obj.matrix_world = world

    bpy.context.view_layer.update()
    expected = {
        name: {
            "position": list(rig.matrix_world.translation),
            "parent": rig.parent.name if rig.parent else None,
        }
        for name, rig in rigs.items()
    }
    return root, expected


def audit_exported_glb(
    glb_path: Path,
    expected_rigs: dict[str, dict[str, object]],
    max_triangles: int,
) -> dict[str, object]:
    source_scene = bpy.context.window.scene
    source_names = {obj: obj.name for obj in source_scene.objects}
    for obj, name in source_names.items():
        obj.name = f"__src_{name}"
    audit_scene = bpy.data.scenes.new("ArtV2_AI_ExportAudit")
    bpy.context.window.scene = audit_scene
    meshes_before = set(bpy.data.meshes)
    materials_before = set(bpy.data.materials)
    images_before = set(bpy.data.images)
    try:
        bpy.ops.import_scene.gltf(filepath=str(glb_path))
        bpy.context.view_layer.update()
        objects = list(audit_scene.objects)
        imported_meshes = [obj for obj in objects if obj.type == "MESH"]
        errors: list[str] = []
        invalid_geometry: list[dict[str, object]] = []
        triangles = degenerate = 0
        for obj in imported_meshes:
            data = obj.data
            data.calc_loop_triangles()
            triangles += len(data.loop_triangles)
            finite_positions = all(math.isfinite(x) for vertex in data.vertices for x in vertex.co)
            finite_normals = all(math.isfinite(x) for vertex in data.vertices for x in vertex.normal)
            usable_normals = all(vertex.normal.length > 0.5 for vertex in data.vertices)
            collapsed = sum(triangle.area <= 1e-12 for triangle in data.loop_triangles)
            degenerate += collapsed
            if not (finite_positions and finite_normals and usable_normals) or collapsed:
                invalid_geometry.append(
                    {
                        "mesh": obj.name,
                        "finite_positions": finite_positions,
                        "finite_normals": finite_normals,
                        "usable_normals": usable_normals,
                        "degenerate_triangles": collapsed,
                    }
                )
        if invalid_geometry:
            errors.append("Exported geometry contains invalid normals or degenerate triangles")
        if not 0 < triangles <= max_triangles:
            errors.append(f"Export triangle budget exceeded: {triangles} > {max_triangles}")
        if len(imported_meshes) > 24:
            errors.append(f"Primitive count exceeded: {len(imported_meshes)} > 24")

        new_images = set(bpy.data.images) - images_before
        oversized_textures = [
            {"name": img.name, "size": [img.size[0], img.size[1]]}
            for img in new_images
            if img.size[0] > 1024 or img.size[1] > 1024
        ]
        if oversized_textures:
            errors.append(f"Textures exceed 1024px budget: {oversized_textures}")

        semantic_rigs: dict[str, dict[str, object]] = {}
        for name in expected_rigs:
            obj = next((o for o in objects if o.type == "EMPTY" and o.name.split(".")[0] == name), None)
            if obj is None:
                errors.append(f"Missing semantic rig: {name}")
                continue
            semantic_rigs[name] = {
                "position_blender": [round(v, 4) for v in obj.matrix_world.translation],
                "parent": obj.parent.name.split(".")[0] if obj.parent else None,
            }

        return {
            "method": "Blender glTF export reimport",
            "triangles": triangles,
            "mesh_objects": len(imported_meshes),
            "materials": len(set(bpy.data.materials) - materials_before),
            "textures": len(new_images),
            "oversized_textures": oversized_textures,
            "degenerate_triangles": degenerate,
            "invalid_geometry_meshes": invalid_geometry,
            "semantic_rigs_found": len(semantic_rigs),
            "errors": errors,
        }
    finally:
        bpy.context.window.scene = source_scene
        for obj in list(audit_scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for obj, name in source_names.items():
            obj.name = name
        bpy.data.scenes.remove(audit_scene)
        for mesh in set(bpy.data.meshes) - meshes_before:
            bpy.data.meshes.remove(mesh)
        for mat in set(bpy.data.materials) - materials_before:
            bpy.data.materials.remove(mat)
        for img in set(bpy.data.images) - images_before:
            bpy.data.images.remove(img)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize, rig, and audit AI 3D dragon meshes.")
    parser.add_argument("--input", type=Path, help="Input .glb/.gltf/.fbx/.obj file from AI 3D tool")
    parser.add_argument("--output-glb", type=Path, default=OUT / "dragon-ai-v2.glb")
    parser.add_argument("--output-blend", type=Path, default=ROOT / "assets/source/art-v2/dragon-ai-v2.blend")
    parser.add_argument("--output-report", type=Path, default=OUT / "dragon-ai-report.json")
    parser.add_argument("--target-triangles", type=int, default=24000)
    parser.add_argument("--max-triangles", type=int, default=60000)
    parser.add_argument("--target-wingspan", type=float, default=12.956)
    parser.add_argument("--forward-axis", choices=["+Y", "-Y", "+X", "-X", "+Z", "-Z"], default="+Y")
    parser.add_argument("--source-tool", type=str, default="Tripo3D-or-Meshy-Paid")
    parser.add_argument("--license", type=str, default="commercial-paid-plan-verified")
    parser.add_argument("--self-test", action="store_true", help="Run pipeline self-test against dragon-v2.glb")
    parser.add_argument("--skip-renders", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    input_path = (OUT / "dragon-v2.glb") if args.self_test else args.input
    if input_path is None or not input_path.exists():
        raise FileNotFoundError(f"Input 3D asset not found: {input_path}")

    OUT.mkdir(parents=True, exist_ok=True)
    clear_file()
    bpy.context.preferences.filepaths.save_version = 0
    collection = make_collection("DRAGON_ART_V2_AI")

    import_raw_mesh(input_path)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bounds_info = normalize_orientation_and_scale(meshes, args.forward_axis, args.target_wingspan)
    decimate_info = enforce_triangle_budget(meshes, args.target_triangles)
    root, expected_rigs = ensure_semantic_rigs(collection, meshes, args.source_tool, args.license)

    output_glb = (OUT / "_self-test-dragon-ai.glb") if args.self_test else args.output_glb
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )

    audit = audit_exported_glb(output_glb, expected_rigs, args.max_triangles)
    raw_bytes = output_glb.read_bytes()
    report = {
        "asset": "dragon-art-v2-ai-pipeline",
        "blender": bpy.app.version_string,
        "input_file": str(input_path.relative_to(ROOT) if input_path.is_relative_to(ROOT) else input_path),
        "source_tool": args.source_tool,
        "license": args.license,
        "steam_ai_disclosure_required": True,
        "decimation": decimate_info,
        "bounds_blender": bounds_info,
        "bytes": len(raw_bytes),
        "gzip_bytes": len(gzip.compress(raw_bytes)),
        "rigs": [name for name, *_ in SEMANTIC_RIG_LAYOUT],
        "export_audit": audit,
        "production_integrated": False,
    }

    if args.self_test:
        output_glb.unlink(missing_ok=True)
    else:
        args.output_blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend), check_existing=False)
        args.output_report.parent.mkdir(parents=True, exist_ok=True)
        args.output_report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    assert not audit["errors"], json.dumps(report, indent=2)
    print("DRAGON_AI_V2_PIPELINE_OK=" + json.dumps(report))


if __name__ == "__main__":
    main()
