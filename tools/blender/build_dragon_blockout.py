from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
REFERENCE_PATH = (
    ROOT
    / "assets"
    / "source"
    / "dragon"
    / "reference"
    / "skyknit-dragon-turnaround-v01.png"
)
BLEND_PATH = (
    ROOT / "assets" / "source" / "dragon" / "skyknit-dragon-v03.blend"
)
RENDER_DIR = ROOT / "artifacts" / "dragon-v03" / "turntable"
REPORT_PATH = ROOT / "artifacts" / "dragon-v03" / "dragon-v03-report.json"

DRAGON_COLLECTION_NAME = "DRAGON_BLOCKOUT"
ENV_COLLECTION_NAME = "STUDIO_ENVIRONMENT"


def clear_file() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material["vertex_color"] = list(color)
    material.use_nodes = True

    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is not None:
        vertex_color = material.node_tree.nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "DragonColor"
        material.node_tree.links.new(
            vertex_color.outputs["Color"], shader.inputs["Base Color"]
        )
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic

        emission = shader.inputs.get("Emission Color")
        emission_power = shader.inputs.get("Emission Strength")
        if emission is not None and emission_strength > 0.0:
            emission.default_value = color
        if emission_power is not None:
            emission_power.default_value = emission_strength

    return material


def apply_vertex_color(
    mesh: bpy.types.Mesh, material: bpy.types.Material
) -> None:
    color = tuple(material.get("vertex_color", (1.0, 1.0, 1.0, 1.0)))
    attribute = mesh.color_attributes.get("DragonColor")
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="DragonColor", type="FLOAT_COLOR", domain="POINT"
        )
    for item in attribute.data:
        item.color = color
    mesh.color_attributes.active_color = attribute


def move_to_collection(
    obj: bpy.types.Object, collection: bpy.types.Collection
) -> None:
    for current_collection in tuple(obj.users_collection):
        current_collection.objects.unlink(obj)
    collection.objects.link(obj)


def finish_object(
    obj: bpy.types.Object,
    name: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    obj.name = name
    if obj.data is not None:
        obj.data.name = f"{name}_Mesh"
        if hasattr(obj.data, "materials"):
            obj.data.materials.append(material)
            apply_vertex_color(obj.data, material)
        if hasattr(obj.data, "polygons"):
            for polygon in obj.data.polygons:
                polygon.use_smooth = False
    move_to_collection(obj, collection)
    obj.parent = root
    return obj


def add_ico(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    subdivisions: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions,
        radius=1.0,
        location=location,
    )
    obj = bpy.context.object
    obj.scale = scale
    return finish_object(obj, name, material, collection, root)


def add_segment(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    vertices: int = 6,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    length = direction.length
    if length <= 0.0001:
        raise ValueError(f"Segment {name} has no length")

    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=length,
        end_fill_type="NGON",
        location=(start_vector + end_vector) * 0.5,
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(
        direction.normalized()
    )
    return finish_object(obj, name, material, collection, root)


def add_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    mesh.materials.append(material)
    apply_vertex_color(mesh, material)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return obj


def add_frustum_box(
    name: str,
    back_center: tuple[float, float, float],
    front_center: tuple[float, float, float],
    back_width: float,
    back_height: float,
    front_width: float,
    front_height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    bx, by, bz = back_center
    fx, fy, fz = front_center
    vertices = [
        (bx - back_width / 2, by, bz - back_height / 2),
        (bx + back_width / 2, by, bz - back_height / 2),
        (bx + back_width / 2, by, bz + back_height / 2),
        (bx - back_width / 2, by, bz + back_height / 2),
        (fx - front_width / 2, fy, fz - front_height / 2),
        (fx + front_width / 2, fy, fz - front_height / 2),
        (fx + front_width / 2, fy, fz + front_height / 2),
        (fx - front_width / 2, fy, fz + front_height / 2),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    return add_mesh(name, vertices, faces, material, collection, root)


def add_diamond_prism(
    name: str,
    center: tuple[float, float, float],
    half_width: float,
    half_height: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    x, y, z = center
    front_y = y + depth / 2
    back_y = y - depth / 2
    vertices = [
        (x - half_width, front_y, z),
        (x, front_y, z + half_height),
        (x + half_width, front_y, z),
        (x, front_y, z - half_height),
        (x - half_width, back_y, z),
        (x, back_y, z + half_height),
        (x + half_width, back_y, z),
        (x, back_y, z - half_height),
    ]
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    return add_mesh(name, vertices, faces, material, collection, root)


def add_side_diamond_prism(
    name: str,
    center: tuple[float, float, float],
    half_width: float,
    half_height: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    x, y, z = center
    right_x = x + depth / 2
    left_x = x - depth / 2
    vertices = [
        (right_x, y - half_width, z),
        (right_x, y, z + half_height),
        (right_x, y + half_width, z),
        (right_x, y, z - half_height),
        (left_x, y - half_width, z),
        (left_x, y, z + half_height),
        (left_x, y + half_width, z),
        (left_x, y, z - half_height),
    ]
    faces = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    return add_mesh(name, vertices, faces, material, collection, root)


def add_octahedron(
    name: str,
    center: tuple[float, float, float],
    radius_x: float,
    radius_y: float,
    radius_z: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    x, y, z = center
    vertices = [
        (x + radius_x, y, z),
        (x - radius_x, y, z),
        (x, y + radius_y, z),
        (x, y - radius_y, z),
        (x, y, z + radius_z),
        (x, y, z - radius_z),
    ]
    faces = [
        (0, 2, 4),
        (2, 1, 4),
        (1, 3, 4),
        (3, 0, 4),
        (2, 0, 5),
        (1, 2, 5),
        (3, 1, 5),
        (0, 3, 5),
    ]
    return add_mesh(name, vertices, faces, material, collection, root)


def add_wing(
    side: int,
    red: bpy.types.Material,
    gold: bpy.types.Material,
    charcoal: bpy.types.Material,
    teal: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    label = "L" if side < 0 else "R"
    s = float(side)
    points = [
        (0.68 * s, 0.52, 3.18),
        (2.34 * s, 0.06, 4.52),
        (5.80 * s, -0.70, 4.02),
        (5.22 * s, -1.52, 3.22),
        (4.48 * s, -2.02, 2.62),
        (3.48 * s, -2.30, 2.30),
        (2.28 * s, -2.06, 2.28),
        (1.32 * s, -1.54, 2.38),
        (0.76 * s, -0.94, 2.62),
    ]
    faces = [
        (0, 1, 8),
        (1, 7, 8),
        (1, 6, 7),
        (1, 5, 6),
        (1, 4, 5),
        (1, 3, 4),
        (1, 2, 3),
    ]
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]

    add_mesh(
        f"Wing_{label}_Membrane",
        points,
        faces,
        gold,
        collection,
        root,
    )
    add_segment(
        f"Wing_{label}_UpperArm",
        points[0],
        points[1],
        0.18,
        0.13,
        red,
        collection,
        root,
        vertices=8,
    )
    add_segment(
        f"Wing_{label}_LeadingEdge",
        points[1],
        points[2],
        0.13,
        0.065,
        red,
        collection,
        root,
        vertices=8,
    )
    for index, point_index in enumerate((3, 4, 5, 6), start=1):
        add_segment(
            f"Wing_{label}_Finger_{index}",
            points[1],
            points[point_index],
            0.085,
            0.035,
            red,
            collection,
            root,
            vertices=7,
        )
    add_segment(
        f"Wing_{label}_TipClaw",
        points[2],
        (points[2][0] + 0.34 * s, points[2][1] - 0.10, points[2][2] + 0.05),
        0.09,
        0.0,
        charcoal,
        collection,
        root,
        vertices=7,
    )
    add_ico(
        f"Wing_{label}_Shoulder",
        points[0],
        (0.33, 0.42, 0.35),
        red,
        collection,
        root,
        subdivisions=4,
    )
    add_diamond_prism(
        f"Wing_{label}_Rune",
        (0.78 * s, 0.68, 3.40),
        0.12,
        0.19,
        0.10,
        teal,
        collection,
        root,
    )


def add_leg(
    kind: str,
    side: int,
    red: bpy.types.Material,
    burgundy: bpy.types.Material,
    charcoal: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    side_label = "L" if side < 0 else "R"
    label = f"{kind}_{side_label}"
    s = float(side)
    if kind == "Fore":
        hip = (0.66 * s, 0.68, 2.24)
        knee = (0.77 * s, 1.02, 1.26)
        ankle = (0.70 * s, 1.30, 0.38)
        foot = (0.70 * s, 1.55, 0.21)
        hip_scale = (0.34, 0.42, 0.40)
        thigh_radii = (0.29, 0.22)
        shin_radii = (0.21, 0.15)
    elif kind == "Hind":
        hip = (0.68 * s, -1.30, 2.08)
        knee = (0.98 * s, -1.05, 1.18)
        ankle = (0.82 * s, -0.38, 0.40)
        foot = (0.82 * s, -0.08, 0.22)
        hip_scale = (0.48, 0.58, 0.48)
        thigh_radii = (0.42, 0.30)
        shin_radii = (0.29, 0.20)
    else:
        raise ValueError(f"Unsupported leg kind: {kind}")

    add_ico(
        f"Leg_{label}_Hip",
        hip,
        hip_scale,
        burgundy,
        collection,
        root,
        subdivisions=2,
    )
    add_segment(
        f"Leg_{label}_Thigh",
        hip,
        knee,
        thigh_radii[0],
        thigh_radii[1],
        red,
        collection,
        root,
        vertices=8,
    )
    add_segment(
        f"Leg_{label}_Shin",
        knee,
        ankle,
        shin_radii[0],
        shin_radii[1],
        red,
        collection,
        root,
        vertices=8,
    )
    add_ico(
        f"Leg_{label}_Foot",
        foot,
        (0.30, 0.46, 0.18) if kind == "Fore" else (0.36, 0.54, 0.20),
        burgundy,
        collection,
        root,
        subdivisions=2,
    )

    for toe_index, x_offset in enumerate((-0.20, 0.0, 0.20), start=1):
        toe_start = (foot[0] + x_offset, foot[1] + 0.14, 0.22)
        toe_knuckle = (
            foot[0] + x_offset * 1.12,
            foot[1] + 0.43,
            0.16,
        )
        toe_end = (
            foot[0] + x_offset * 1.28,
            foot[1] + 0.70,
            0.08,
        )
        add_segment(
            f"Leg_{label}_Toe_{toe_index}",
            toe_start,
            toe_knuckle,
            0.105,
            0.075,
            burgundy,
            collection,
            root,
            vertices=7,
        )
        add_segment(
            f"Leg_{label}_Claw_{toe_index}",
            toe_knuckle,
            toe_end,
            0.075,
            0.0,
            charcoal,
            collection,
            root,
            vertices=7,
        )


def add_dragon(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> None:
    red = materials["red"]
    burgundy = materials["burgundy"]
    gold = materials["gold"]
    charcoal = materials["charcoal"]
    teal = materials["teal"]

    add_ico(
        "Torso_Chest",
        (0.0, 0.42, 2.58),
        (0.80, 1.30, 0.82),
        red,
        collection,
        root,
        subdivisions=5,
    )
    add_ico(
        "Torso_Abdomen",
        (0.0, -0.90, 2.36),
        (0.67, 1.44, 0.66),
        burgundy,
        collection,
        root,
        subdivisions=4,
    )
    add_ico(
        "Torso_Pelvis",
        (0.0, -1.68, 2.22),
        (0.76, 0.78, 0.67),
        burgundy,
        collection,
        root,
        subdivisions=4,
    )

    neck_points = [
        (0.0, 1.02, 3.00),
        (0.0, 1.54, 3.46),
        (0.0, 2.20, 3.88),
        (0.0, 2.92, 4.24),
        (0.0, 3.45, 4.34),
    ]
    neck_radii = [
        (0.49, 0.43),
        (0.43, 0.36),
        (0.36, 0.30),
        (0.30, 0.25),
    ]
    for index, (start, end) in enumerate(
        zip(neck_points, neck_points[1:]), start=1
    ):
        radius_start, radius_end = neck_radii[index - 1]
        add_segment(
            f"Neck_{index}",
            start,
            end,
            radius_start,
            radius_end,
            red,
            collection,
            root,
            vertices=10,
        )

    add_ico(
        "Head_Cranium",
        (0.0, 3.58, 4.36),
        (0.51, 0.57, 0.45),
        red,
        collection,
        root,
        subdivisions=5,
    )
    add_frustum_box(
        "Head_MidSnout",
        (0.0, 3.63, 4.29),
        (0.0, 4.02, 4.23),
        0.64,
        0.42,
        0.48,
        0.31,
        red,
        collection,
        root,
    )
    add_frustum_box(
        "Head_Nose",
        (0.0, 4.00, 4.23),
        (0.0, 4.52, 4.14),
        0.54,
        0.31,
        0.38,
        0.22,
        burgundy,
        collection,
        root,
    )
    add_frustum_box(
        "Jaw_Main",
        (0.0, 3.67, 4.08),
        (0.0, 4.30, 3.98),
        0.58,
        0.19,
        0.36,
        0.13,
        gold,
        collection,
        root,
    )

    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        s = float(side)
        add_ico(
            f"EyeSocket_{label}",
            (0.34 * s, 3.86, 4.43),
            (0.16, 0.18, 0.12),
            burgundy,
            collection,
            root,
            subdivisions=3,
        )
        add_ico(
            f"Eye_{label}_Iris",
            (0.36 * s, 3.90, 4.42),
            (0.080, 0.135, 0.078),
            teal,
            collection,
            root,
            subdivisions=3,
        )
        add_ico(
            f"Eye_{label}_Pupil",
            (0.365 * s, 4.018, 4.42),
            (0.027, 0.018, 0.058),
            charcoal,
            collection,
            root,
            subdivisions=2,
        )
        add_ico(
            f"Eye_{label}_Highlight",
            (0.383 * s, 4.030, 4.458),
            (0.018, 0.012, 0.018),
            gold,
            collection,
            root,
            subdivisions=2,
        )
        add_ico(
            f"Brow_{label}",
            (0.28 * s, 3.83, 4.52),
            (0.26, 0.19, 0.09),
            burgundy,
            collection,
            root,
            subdivisions=2,
        )
        add_segment(
            f"Brow_Ridge_{label}",
            (0.08 * s, 3.94, 4.57),
            (0.48 * s, 3.87, 4.50),
            0.075,
            0.045,
            red,
            collection,
            root,
            vertices=7,
        )
        horn_mid = (0.34 * s, 3.18, 5.22)
        add_segment(
            f"Horn_{label}_Base",
            (0.25 * s, 3.47, 4.66),
            horn_mid,
            0.16,
            0.105,
            charcoal,
            collection,
            root,
            vertices=8,
        )
        add_segment(
            f"Horn_{label}_Tip",
            horn_mid,
            (0.55 * s, 2.72, 5.66),
            0.105,
            0.0,
            charcoal,
            collection,
            root,
            vertices=8,
        )
        add_segment(
            f"CheekSpike_{label}",
            (0.44 * s, 3.57, 4.24),
            (0.96 * s, 3.22, 4.13),
            0.125,
            0.0,
            charcoal,
            collection,
            root,
            vertices=7,
        )
        add_ico(
            f"Nostril_{label}",
            (0.14 * s, 4.48, 4.20),
            (0.050, 0.030, 0.035),
            charcoal,
            collection,
            root,
            subdivisions=2,
        )
        add_segment(
            f"Jaw_MouthLine_{label}",
            (0.12 * s, 4.00, 4.075),
            (0.20 * s, 4.38, 4.035),
            0.025,
            0.018,
            charcoal,
            collection,
            root,
            vertices=6,
        )
        add_segment(
            f"Jaw_Tooth_{label}",
            (0.22 * s, 4.20, 3.995),
            (0.22 * s, 4.24, 3.88),
            0.045,
            0.0,
            gold,
            collection,
            root,
            vertices=6,
        )

    plate_specs = [
        ((0.0, 3.12, 4.03), 0.28, 0.16),
        ((0.0, 2.65, 3.79), 0.32, 0.18),
        ((0.0, 2.17, 3.50), 0.37, 0.20),
        ((0.0, 1.72, 3.17), 0.42, 0.22),
        ((0.0, 1.31, 2.85), 0.46, 0.24),
        ((0.0, 0.95, 2.58), 0.48, 0.24),
    ]
    for index, (center, width, height) in enumerate(plate_specs, start=1):
        add_diamond_prism(
            f"ChestPlate_{index}",
            center,
            width,
            height,
            0.10,
            gold,
            collection,
            root,
        )

    tail_points = [
        (0.0, -1.62, 2.23),
        (0.0, -2.64, 2.10),
        (0.0, -3.72, 1.96),
        (0.0, -4.82, 1.87),
        (0.0, -5.90, 1.89),
        (0.0, -6.78, 2.02),
    ]
    tail_radii = [0.53, 0.43, 0.33, 0.23, 0.14, 0.055]
    for index, (start, end) in enumerate(
        zip(tail_points, tail_points[1:]), start=1
    ):
        add_segment(
            f"Tail_{index}",
            start,
            end,
            tail_radii[index - 1],
            tail_radii[index],
            red if index < 4 else burgundy,
            collection,
            root,
            vertices=12,
        )

    add_segment(
        "TailFin_Stem",
        tail_points[-1],
        (0.0, -7.02, 1.86),
        0.10,
        0.18,
        red,
        collection,
        root,
        vertices=6,
    )
    add_octahedron(
        "TailFin_Diamond",
        (0.0, -7.18, 1.86),
        0.48,
        0.48,
        0.66,
        red,
        collection,
        root,
    )
    add_diamond_prism(
        "TailFin_FrontInlay",
        (0.0, -7.18, 1.86),
        0.20,
        0.30,
        0.78,
        gold,
        collection,
        root,
    )
    add_side_diamond_prism(
        "TailFin_SideInlay",
        (0.0, -7.18, 1.86),
        0.20,
        0.30,
        0.78,
        gold,
        collection,
        root,
    )

    spine_specs = [
        ((0.0, 2.86, 4.44), (0.0, 2.78, 4.87), 0.13),
        ((0.0, 2.22, 4.22), (0.0, 2.12, 4.68), 0.14),
        ((0.0, 1.55, 3.88), (0.0, 1.45, 4.34), 0.15),
        ((0.0, 0.83, 3.42), (0.0, 0.74, 3.87), 0.15),
        ((0.0, -0.10, 3.20), (0.0, -0.15, 3.62), 0.14),
        ((0.0, -1.18, 2.83), (0.0, -1.23, 3.20), 0.13),
        ((0.0, -2.12, 2.48), (0.0, -2.16, 2.80), 0.11),
        ((0.0, -3.10, 2.27), (0.0, -3.14, 2.54), 0.095),
        ((0.0, -4.12, 2.07), (0.0, -4.16, 2.30), 0.08),
        ((0.0, -5.10, 1.99), (0.0, -5.14, 2.18), 0.065),
        ((0.0, -6.02, 1.98), (0.0, -6.06, 2.14), 0.05),
    ]
    for index, (base, tip, radius) in enumerate(spine_specs, start=1):
        add_segment(
            f"DorsalSpine_{index}",
            base,
            tip,
            radius,
            0.0,
            charcoal,
            collection,
            root,
            vertices=4,
        )

    add_wing(-1, red, gold, charcoal, teal, collection, root)
    add_wing(1, red, gold, charcoal, teal, collection, root)
    add_leg("Fore", -1, red, burgundy, charcoal, collection, root)
    add_leg("Fore", 1, red, burgundy, charcoal, collection, root)
    add_leg("Hind", -1, red, burgundy, charcoal, collection, root)
    add_leg("Hind", 1, red, burgundy, charcoal, collection, root)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_studio(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Object, Vector]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(RENDER_DIR / "angle-000-front.png")
    scene.render.use_file_extension = True

    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.32, 0.38, 0.39, 1.0)
    background.inputs["Strength"].default_value = 0.65

    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    bpy.ops.mesh.primitive_plane_add(size=40.0, location=(0.0, 0.0, 0.0))
    ground = bpy.context.object
    ground.name = "Studio_Ground"
    ground.data.name = "Studio_Ground_Mesh"
    ground.data.materials.append(materials["ground"])
    move_to_collection(ground, collection)

    target = Vector((0.0, -1.30, 2.60))
    camera_data = bpy.data.cameras.new("Turntable_Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 13.4
    camera = bpy.data.objects.new("Turntable_Camera", camera_data)
    collection.objects.link(camera)
    scene.camera = camera

    def add_area_light(
        name: str,
        location: tuple[float, float, float],
        energy: float,
        color: tuple[float, float, float],
        size: float,
    ) -> bpy.types.Object:
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        collection.objects.link(light)
        look_at(light, target)
        return light

    add_area_light(
        "Key_Light",
        (5.5, 7.5, 10.0),
        1150.0,
        (1.0, 0.76, 0.58),
        5.5,
    )
    add_area_light(
        "Fill_Light",
        (-6.0, 1.0, 6.0),
        850.0,
        (0.46, 0.72, 1.0),
        6.5,
    )
    add_area_light(
        "Rim_Light",
        (2.0, -7.0, 8.0),
        1000.0,
        (0.65, 0.95, 1.0),
        4.0,
    )
    return camera, target


def set_camera_angle(
    camera: bpy.types.Object, target: Vector, angle_degrees: int
) -> None:
    angle = math.radians(angle_degrees)
    radius = 16.0
    camera.location = (
        radius * math.sin(angle),
        radius * math.cos(angle),
        4.25,
    )
    look_at(camera, target)


def render_turntable(camera: bpy.types.Object, target: Vector) -> list[str]:
    rendered_files: list[str] = []
    angle_names = {
        0: "front",
        45: "front-right",
        90: "right",
        135: "rear-right",
        180: "rear",
        225: "rear-left",
        270: "left",
        315: "front-left",
    }
    for angle, label in angle_names.items():
        set_camera_angle(camera, target, angle)
        output = RENDER_DIR / f"angle-{angle:03d}-{label}.png"
        bpy.context.scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        rendered_files.append(str(output.relative_to(ROOT)))
        print(f"RENDERED={output}")
    set_camera_angle(camera, target, 0)
    return rendered_files


def collect_mesh_stats(collection: bpy.types.Collection) -> dict[str, object]:
    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    vertices = 0
    triangles = 0
    for obj in mesh_objects:
        mesh = obj.data
        vertices += len(mesh.vertices)
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)

    min_corner = Vector((math.inf, math.inf, math.inf))
    max_corner = Vector((-math.inf, -math.inf, -math.inf))
    for obj in mesh_objects:
        for local_corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(local_corner)
            min_corner.x = min(min_corner.x, world_corner.x)
            min_corner.y = min(min_corner.y, world_corner.y)
            min_corner.z = min(min_corner.z, world_corner.z)
            max_corner.x = max(max_corner.x, world_corner.x)
            max_corner.y = max(max_corner.y, world_corner.y)
            max_corner.z = max(max_corner.z, world_corner.z)

    return {
        "mesh_objects": len(mesh_objects),
        "vertices": vertices,
        "triangles": triangles,
        "bounds_min": [round(value, 3) for value in min_corner],
        "bounds_max": [round(value, 3) for value in max_corner],
        "materials": sorted(
            {
                slot.material.name
                for obj in mesh_objects
                for slot in obj.material_slots
                if slot.material is not None
            }
        ),
    }


def main() -> None:
    if not REFERENCE_PATH.exists():
        raise FileNotFoundError(f"Missing reference image: {REFERENCE_PATH}")

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    clear_file()
    scene = bpy.context.scene
    scene.name = "Skyknot_Dragon_Character_Remaster_v03"

    dragon_collection = make_collection(DRAGON_COLLECTION_NAME)
    environment_collection = make_collection(ENV_COLLECTION_NAME)

    root = bpy.data.objects.new("DragonRoot", None)
    root.empty_display_type = "ARROWS"
    root.empty_display_size = 1.0
    root["asset_version"] = "0.3"
    root["blockout_iteration"] = 5
    root["asset_status"] = "rc3-character-remaster"
    root["forward_axis"] = "+Y"
    root["up_axis"] = "+Z"
    root["reference"] = str(REFERENCE_PATH.relative_to(ROOT))
    dragon_collection.objects.link(root)

    materials = {
        "red": make_material(
            "M_Dragon_Ember", (0.56, 0.020, 0.012, 1.0), 0.78
        ),
        "burgundy": make_material(
            "M_Dragon_Burgundy", (0.22, 0.008, 0.018, 1.0), 0.82
        ),
        "gold": make_material(
            "M_Wing_Gold", (1.0, 0.56, 0.075, 1.0), 0.64
        ),
        "charcoal": make_material(
            "M_Horn_Charcoal", (0.018, 0.014, 0.025, 1.0), 0.62
        ),
        "teal": make_material(
            "M_Rune_Teal", (0.0, 0.42, 0.48, 1.0), 0.42, 0.02, 1.2
        ),
        "ground": make_material(
            "M_Studio_Ground", (0.24, 0.29, 0.29, 1.0), 0.92
        ),
    }

    add_dragon(dragon_collection, root, materials)

    reference_image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    reference_image.name = "REF_Skyknot_Dragon_Turnaround_v01"
    reference_image.use_fake_user = True
    reference_image.pack()

    camera, target = create_studio(environment_collection, materials)
    set_camera_angle(camera, target, 0)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    rendered_files = render_turntable(camera, target)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

    stats = collect_mesh_stats(dragon_collection)
    report = {
        "asset": "skyknit-dragon-v03",
        "status": "rc3-character-remaster-source",
        "iteration": 5,
        "blender_version": bpy.app.version_string,
        "blend_file": str(BLEND_PATH.relative_to(ROOT)),
        "reference_file": str(REFERENCE_PATH.relative_to(ROOT)),
        "renders": rendered_files,
        **stats,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("DRAGON_BLOCKOUT_REPORT=" + json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    main()
