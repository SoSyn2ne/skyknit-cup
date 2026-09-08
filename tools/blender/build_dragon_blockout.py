from __future__ import annotations

import argparse
import json
import math
import sys
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
    ROOT / "assets" / "source" / "dragon" / "skyknit-dragon-v08.blend"
)
RENDER_DIR = ROOT / "artifacts" / "dragon-v08" / "turntable"
REPORT_PATH = ROOT / "artifacts" / "dragon-v08" / "dragon-v08-report.json"

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
    tip_color: tuple[float, float, float, float] | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material["vertex_color"] = list(color)
    if tip_color is not None:
        material["vertex_color_tip"] = list(tip_color)
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
        coat_weight = shader.inputs.get("Coat Weight")
        if coat_weight is not None:
            coat_weight.default_value = 0.0

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
    tip_color = material.get("vertex_color_tip")
    if tip_color is None or len(mesh.vertices) == 0:
        for item in attribute.data:
            item.color = color
    else:
        tip = tuple(tip_color)
        distances = [abs(vertex.co.x) for vertex in mesh.vertices]
        lower = min(distances)
        span = max(max(distances) - lower, 0.0001)
        for vertex, item in zip(mesh.vertices, attribute.data):
            blend = min(1.0, max(0.0, (abs(vertex.co.x) - lower) / span))
            item.color = tuple(
                start + (end - start) * blend
                for start, end in zip(color, tip)
            )
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
    *,
    smooth: bool = True,
) -> bpy.types.Object:
    obj.name = name
    if obj.data is not None:
        obj.data.name = f"{name}_Mesh"
        if hasattr(obj.data, "materials"):
            obj.data.materials.append(material)
            apply_vertex_color(obj.data, material)
        if hasattr(obj.data, "polygons"):
            for polygon in obj.data.polygons:
                polygon.use_smooth = smooth
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
    smooth: bool = True,
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
    return finish_object(
        obj, name, material, collection, root, smooth=smooth
    )


def add_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    smooth: bool = False,
    bevel_width: float = 0.0,
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
        polygon.use_smooth = smooth
    if bevel_width > 0.0:
        bevel = obj.modifiers.new(name="RC7_EdgeBevel", type="BEVEL")
        bevel.width = bevel_width
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(24.0)
    return obj


def add_anatomical_loft(
    name: str,
    centers: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    radial_segments: int = 12,
    subdivision_levels: int = 1,
    subdivision_type: str = "CATMULL_CLARK",
    smooth: bool = True,
    profile_power: float = 1.0,
    ring_shadows: list[float] | None = None,
) -> bpy.types.Object:
    if len(centers) != len(radii) or len(centers) < 2:
        raise ValueError(f"Loft {name} has an invalid ring contract")
    if radial_segments < 6:
        raise ValueError(f"Loft {name} needs at least six radial segments")
    if profile_power <= 0.0:
        raise ValueError(f"Loft {name} needs a positive profile power")
    if ring_shadows is not None and len(ring_shadows) != len(centers):
        raise ValueError(f"Loft {name} has an invalid ring-shadow contract")

    center_vectors = [Vector(center) for center in centers]
    vertices: list[tuple[float, float, float]] = []
    colors: list[tuple[float, float, float, float]] = []
    base_color = tuple(
        material.get("vertex_color", (1.0, 1.0, 1.0, 1.0))
    )
    shadow_color = tuple(
        shadow_material.get("vertex_color", base_color)
    )

    for ring_index, (center, radius) in enumerate(
        zip(center_vectors, radii)
    ):
        if ring_index == 0:
            tangent = center_vectors[1] - center
        elif ring_index == len(center_vectors) - 1:
            tangent = center - center_vectors[ring_index - 1]
        else:
            tangent = center_vectors[ring_index + 1] - center_vectors[ring_index - 1]
        tangent.normalize()

        width_axis = Vector((1.0, 0.0, 0.0))
        width_axis -= tangent * width_axis.dot(tangent)
        if width_axis.length_squared < 0.001:
            width_axis = Vector((0.0, 1.0, 0.0))
            width_axis -= tangent * width_axis.dot(tangent)
        width_axis.normalize()
        depth_axis = tangent.cross(width_axis).normalized()

        radius_width, radius_depth = radius
        end_ao = 0.08 if ring_index in (0, len(centers) - 1) else 0.0
        for segment_index in range(radial_segments):
            angle = math.tau * segment_index / radial_segments
            raw_across = math.cos(angle)
            raw_around = math.sin(angle)
            across = math.copysign(abs(raw_across) ** profile_power, raw_across)
            around = math.copysign(abs(raw_around) ** profile_power, raw_around)
            vertex = (
                center
                + width_axis * across * radius_width
                + depth_axis * around * radius_depth
            )
            vertices.append(tuple(vertex))

            underside_ao = max(0.0, around) * 0.36
            flank_ao = abs(across) * 0.10
            ring_ao = ring_shadows[ring_index] if ring_shadows is not None else 0.0
            blend = min(0.58, end_ao + underside_ao + flank_ao + ring_ao)
            colors.append(
                tuple(
                    start + (end - start) * blend
                    for start, end in zip(base_color, shadow_color)
                )
            )

    faces: list[tuple[int, ...]] = []
    for ring_index in range(len(centers) - 1):
        ring_start = ring_index * radial_segments
        next_start = (ring_index + 1) * radial_segments
        for segment_index in range(radial_segments):
            following = (segment_index + 1) % radial_segments
            faces.append(
                (
                    ring_start + segment_index,
                    ring_start + following,
                    next_start + following,
                    next_start + segment_index,
                )
            )
    faces.append(tuple(reversed(range(radial_segments))))
    final_start = (len(centers) - 1) * radial_segments
    faces.append(tuple(final_start + index for index in range(radial_segments)))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)
    mesh.materials.append(material)
    color_attribute = mesh.color_attributes.new(
        name="DragonColor", type="FLOAT_COLOR", domain="POINT"
    )
    for item, color in zip(color_attribute.data, colors):
        item.color = color
    mesh.color_attributes.active_color = color_attribute
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root

    if subdivision_levels > 0:
        subdivision = obj.modifiers.new(
            name="RC7_AnatomySubdivision", type="SUBSURF"
        )
        subdivision.subdivision_type = subdivision_type
        subdivision.levels = subdivision_levels
        subdivision.render_levels = subdivision_levels
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=subdivision.name)
        for polygon in obj.data.polygons:
            polygon.use_smooth = smooth
    return obj


def recolor_mesh_by_position(
    obj: bpy.types.Object,
    base_material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    *,
    side_strength: float = 0.18,
    underside_strength: float = 0.28,
    forward_strength: float = 0.0,
) -> None:
    mesh = obj.data
    attribute = mesh.color_attributes.get("DragonColor")
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="DragonColor", type="FLOAT_COLOR", domain="POINT"
        )
    base_color = tuple(
        base_material.get("vertex_color", (1.0, 1.0, 1.0, 1.0))
    )
    shadow_color = tuple(
        shadow_material.get("vertex_color", base_color)
    )
    xs = [vertex.co.x for vertex in mesh.vertices]
    ys = [vertex.co.y for vertex in mesh.vertices]
    zs = [vertex.co.z for vertex in mesh.vertices]
    x_span = max(max(abs(value) for value in xs), 0.0001)
    y_min, y_max = min(ys), max(ys)
    z_min, z_max = min(zs), max(zs)
    y_span = max(y_max - y_min, 0.0001)
    z_span = max(z_max - z_min, 0.0001)
    for vertex, item in zip(mesh.vertices, attribute.data):
        side = abs(vertex.co.x) / x_span
        underside = 1.0 - (vertex.co.z - z_min) / z_span
        forward = (vertex.co.y - y_min) / y_span
        blend = min(
            0.62,
            side * side_strength
            + underside * underside_strength
            + forward * forward_strength,
        )
        item.color = tuple(
            start + (end - start) * blend
            for start, end in zip(base_color, shadow_color)
        )
    mesh.color_attributes.active_color = attribute


def recolor_segment_gradient(
    obj: bpy.types.Object,
    start_color: tuple[float, float, float, float],
    end_color: tuple[float, float, float, float],
) -> None:
    mesh = obj.data
    attribute = mesh.color_attributes.get("DragonColor")
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="DragonColor", type="FLOAT_COLOR", domain="POINT"
        )
    z_values = [vertex.co.z for vertex in mesh.vertices]
    lower, upper = min(z_values), max(z_values)
    span = max(upper - lower, 0.0001)
    for vertex, item in zip(mesh.vertices, attribute.data):
        blend = min(1.0, max(0.0, (vertex.co.z - lower) / span))
        item.color = tuple(
            start + (end - start) * blend
            for start, end in zip(start_color, end_color)
        )
    mesh.color_attributes.active_color = attribute


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

    def chamfered_ring(
        x: float, y: float, z: float, width: float, height: float
    ) -> list[tuple[float, float, float]]:
        half_width = width * 0.5
        half_height = height * 0.5
        shoulder = width * 0.34
        cheek = height * 0.27
        return [
            (x - shoulder, y, z - half_height),
            (x + shoulder, y, z - half_height),
            (x + half_width, y, z - cheek),
            (x + half_width, y, z + cheek),
            (x + shoulder, y, z + half_height),
            (x - shoulder, y, z + half_height),
            (x - half_width, y, z + cheek),
            (x - half_width, y, z - cheek),
        ]

    vertices = chamfered_ring(
        bx, by, bz, back_width, back_height
    ) + chamfered_ring(fx, fy, fz, front_width, front_height)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(8))),
        tuple(range(8, 16)),
    ]
    for index in range(8):
        following = (index + 1) % 8
        faces.append((index, following, following + 8, index + 8))
    return add_mesh(
        name,
        vertices,
        faces,
        material,
        collection,
        root,
        bevel_width=0.022,
    )


def add_angular_head_cranium(
    material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    ring_specs = [
        (2.78, 4.58, 0.64, 0.60),
        (3.02, 4.61, 0.98, 0.82),
        (3.32, 4.63, 1.16, 0.80),
        (3.62, 4.57, 1.02, 0.62),
        (3.84, 4.47, 0.74, 0.43),
    ]

    def ring(
        y: float, z: float, width: float, height: float
    ) -> list[tuple[float, float, float]]:
        half_width = width * 0.5
        half_height = height * 0.5
        brow = width * 0.29
        cheek = height * 0.28
        return [
            (-brow, y, z - half_height),
            (brow, y, z - half_height),
            (half_width, y, z - cheek),
            (half_width, y, z + cheek),
            (brow, y, z + half_height),
            (-brow, y, z + half_height),
            (-half_width, y, z + cheek),
            (-half_width, y, z - cheek),
        ]

    vertices = [
        vertex
        for y, z, width, height in ring_specs
        for vertex in ring(y, z, width, height)
    ]
    faces: list[tuple[int, ...]] = []
    ring_size = 8
    for ring_index in range(len(ring_specs) - 1):
        current = ring_index * ring_size
        following_ring = current + ring_size
        for segment_index in range(ring_size):
            following = (segment_index + 1) % ring_size
            faces.append(
                (
                    current + segment_index,
                    current + following,
                    following_ring + following,
                    following_ring + segment_index,
                )
            )

    rear_center = len(vertices)
    vertices.append((0.0, ring_specs[0][0], ring_specs[0][1]))
    front_center = len(vertices)
    vertices.append((0.0, ring_specs[-1][0], ring_specs[-1][1]))
    front_start = (len(ring_specs) - 1) * ring_size
    for segment_index in range(ring_size):
        following = (segment_index + 1) % ring_size
        faces.append((rear_center, following, segment_index))
        faces.append(
            (front_center, front_start + segment_index, front_start + following)
        )

    obj = add_mesh(
        "Head_Cranium",
        vertices,
        faces,
        material,
        collection,
        root,
        smooth=False,
    )
    subdivision = obj.modifiers.new(
        name="RC7_HeadPlaneSubdivision", type="SUBSURF"
    )
    subdivision.subdivision_type = "SIMPLE"
    subdivision.levels = 3
    subdivision.render_levels = 3
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    recolor_mesh_by_position(
        obj,
        material,
        shadow_material,
        side_strength=0.24,
        underside_strength=0.32,
        forward_strength=0.03,
    )
    return obj


def add_cheek_wedge(
    side: int,
    material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    label = "L" if side < 0 else "R"
    s = float(side)
    vertices = [
        (0.20 * s, 3.02, 4.64),
        (0.50 * s, 3.04, 4.56),
        (0.57 * s, 3.52, 4.48),
        (0.25 * s, 3.78, 4.40),
        (0.20 * s, 3.00, 4.24),
        (0.55 * s, 3.06, 4.20),
        (0.49 * s, 3.64, 4.19),
        (0.23 * s, 3.82, 4.23),
    ]
    faces: list[tuple[int, ...]] = [
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    obj = add_mesh(
        f"Head_Cheek_{label}",
        vertices,
        faces,
        material,
        collection,
        root,
        smooth=False,
    )
    subdivision = obj.modifiers.new(
        name="RC7_CheekPlaneSubdivision", type="SUBSURF"
    )
    subdivision.subdivision_type = "SIMPLE"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    recolor_mesh_by_position(
        obj,
        material,
        shadow_material,
        side_strength=0.18,
        underside_strength=0.30,
        forward_strength=0.04,
    )
    return obj


def add_belly_plate(
    name: str,
    center: tuple[float, float, float],
    top_width: float,
    bottom_width: float,
    half_height: float,
    depth: float,
    material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    x, y, z = center
    front_y = y + depth * 0.5
    back_y = y - depth * 0.5
    front = [
        (x - top_width, front_y, z + half_height),
        (x + top_width, front_y, z + half_height),
        (x + bottom_width, front_y, z - half_height * 0.55),
        (x, front_y, z - half_height),
        (x - bottom_width, front_y, z - half_height * 0.55),
    ]
    back = [(vx, back_y, vz) for vx, _, vz in front]
    faces: list[tuple[int, ...]] = [
        (0, 1, 2, 3, 4),
        tuple(reversed(range(5, 10))),
    ]
    for index in range(5):
        following = (index + 1) % 5
        faces.append((index, following, following + 5, index + 5))
    obj = add_mesh(
        name,
        front + back,
        faces,
        material,
        collection,
        root,
        smooth=False,
        bevel_width=0.014,
    )
    recolor_mesh_by_position(
        obj,
        material,
        shadow_material,
        side_strength=0.04,
        underside_strength=0.30,
    )
    return obj


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


def add_wing_membrane(
    side: int,
    points: list[tuple[float, float, float]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    label = "L" if side < 0 else "R"
    surface_faces = [
        (0, 1, 11),
        (1, 10, 11),
        (1, 9, 10),
        (1, 8, 9),
        (1, 7, 8),
        (1, 6, 7),
        (1, 2, 6),
        (2, 5, 6),
        (2, 4, 5),
        (2, 3, 4),
    ]
    if side < 0:
        surface_faces = [tuple(reversed(face)) for face in surface_faces]

    # Camber each membrane panel between the existing finger bones. Keeping the
    # perimeter fixed preserves the wing silhouette and the runtime wing pivots.
    panel_points = list(points)
    cambered_faces = []
    for face in surface_faces:
        center = sum((Vector(points[index]) for index in face), Vector()) / 3.0
        center.z += 0.16
        center_index = len(panel_points)
        panel_points.append(tuple(center))
        for edge_index in range(3):
            cambered_faces.append((face[edge_index], face[(edge_index + 1) % 3], center_index))
    surface_faces = cambered_faces
    half_thickness = 0.032
    top = [(x, y, z + half_thickness) for x, y, z in panel_points]
    bottom = [(x, y, z - half_thickness) for x, y, z in panel_points]
    offset = len(panel_points)
    faces = list(surface_faces)
    faces.extend(
        tuple(index + offset for index in reversed(face))
        for face in surface_faces
    )
    boundary = tuple(range(len(points)))
    for index, current in enumerate(boundary):
        following = boundary[(index + 1) % len(boundary)]
        faces.append(
            (current, following, following + offset, current + offset)
        )

    membrane = add_mesh(
        f"Wing_{label}_Membrane",
        top + bottom,
        faces,
        material,
        collection,
        root,
        smooth=True,
    )
    colors = membrane.data.color_attributes["DragonColor"]
    for index, item in enumerate(colors.data):
        # Raised panel centers catch a pale amber highlight; the outer rim stays
        # darker so the ribs and scalloped edge read from the chase camera.
        is_panel_center = index % offset >= len(points)
        shade = 1.10 if is_panel_center else 0.82
        color = item.color[:]
        item.color = (min(1.0, color[0] * shade), min(1.0, color[1] * shade), min(1.0, color[2] * shade), 1.0)


def add_wing(
    side: int,
    red: bpy.types.Material,
    burgundy: bpy.types.Material,
    membrane: bpy.types.Material,
    charcoal: bpy.types.Material,
    teal: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    label = "L" if side < 0 else "R"
    s = float(side)
    points = [
        (0.68 * s, 0.48, 3.16),
        (2.28 * s, 0.08, 4.50),
        (4.10 * s, -0.42, 4.62),
        (5.92 * s, -1.12, 3.82),
        (5.28 * s, -1.70, 2.94),
        (4.88 * s, -1.58, 3.28),
        (4.40 * s, -2.12, 2.43),
        (3.94 * s, -1.90, 2.84),
        (3.28 * s, -2.31, 2.16),
        (2.78 * s, -2.00, 2.59),
        (2.14 * s, -2.12, 2.20),
        (1.18 * s, -1.30, 2.56),
    ]
    add_wing_membrane(side, points, membrane, collection, root)
    add_anatomical_loft(
        f"Wing_{label}_ArmLoft",
        [
            (0.42 * s, 0.54, 2.98),
            points[0],
            (1.36 * s, 0.34, 3.78),
            points[1],
            (3.20 * s, -0.18, 4.62),
            points[2],
        ],
        [
            (0.36, 0.40),
            (0.34, 0.37),
            (0.25, 0.27),
            (0.18, 0.20),
            (0.12, 0.14),
            (0.095, 0.11),
        ],
        red,
        burgundy,
        collection,
        root,
        radial_segments=8,
        subdivision_levels=1,
        subdivision_type="SIMPLE",
        smooth=False,
        profile_power=0.84,
        ring_shadows=[0.03, 0.0, 0.02, 0.04, 0.07, 0.10],
    )
    add_segment(
        f"Wing_{label}_LeadingEdge",
        points[2],
        points[3],
        0.105,
        0.055,
        red,
        collection,
        root,
        vertices=8,
    )
    for index, point_index in enumerate((4, 6, 8), start=1):
        add_segment(
            f"Wing_{label}_Finger_{index}",
            points[2],
            points[point_index],
            0.070,
            0.030,
            red,
            collection,
            root,
            vertices=7,
        )
    add_segment(
        f"Wing_{label}_Finger_4",
        points[1],
        points[10],
        0.075,
        0.030,
        red,
        collection,
        root,
        vertices=7,
    )
    add_segment(
        f"Wing_{label}_TipClaw",
        points[3],
        (
            points[3][0] + 0.34 * s,
            points[3][1] - 0.10,
            points[3][2] + 0.05,
        ),
        0.09,
        0.0,
        charcoal,
        collection,
        root,
        vertices=7,
    )
    add_diamond_prism(
        f"Wing_{label}_Rune",
        (0.80 * s, 0.66, 3.42),
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
        hip = (0.76 * s, 0.62, 2.55)
        knee = (0.86 * s, 1.10, 1.66)
        ankle = (0.72 * s, 0.96, 0.76)
        foot = (0.72 * s, 1.32, 0.31)
        toe_origin = (0.72 * s, 1.58, 0.22)
        limb_centers = [
            (0.52 * s, 0.44, 2.88),
            hip,
            (0.82 * s, 0.84, 2.18),
            knee,
            (0.80 * s, 1.04, 1.18),
            ankle,
            (0.72 * s, 1.08, 0.50),
            foot,
            toe_origin,
        ]
        limb_radii = [
            (0.42, 0.45),
            (0.43, 0.46),
            (0.34, 0.36),
            (0.23, 0.25),
            (0.16, 0.17),
            (0.19, 0.20),
            (0.21, 0.18),
            (0.25, 0.15),
            (0.19, 0.10),
        ]
    elif kind == "Hind":
        hip = (0.94 * s, -1.40, 2.25)
        knee = (1.28 * s, -0.96, 1.45)
        ankle = (1.18 * s, -1.50, 0.69)
        foot = (1.13 * s, -0.82, 0.28)
        toe_origin = (1.13 * s, -0.57, 0.21)
        limb_centers = [
            (0.60 * s, -1.52, 2.45),
            hip,
            (1.18 * s, -1.16, 1.85),
            knee,
            (1.22 * s, -1.16, 1.03),
            ankle,
            (1.13 * s, -1.18, 0.46),
            foot,
            toe_origin,
        ]
        limb_radii = [
            (0.62, 0.64),
            (0.62, 0.65),
            (0.47, 0.50),
            (0.30, 0.32),
            (0.19, 0.20),
            (0.23, 0.24),
            (0.25, 0.19),
            (0.29, 0.16),
            (0.23, 0.10),
        ]
    else:
        raise ValueError(f"Unsupported leg kind: {kind}")

    add_anatomical_loft(
        f"Leg_{label}_LimbLoft",
        limb_centers,
        limb_radii,
        red,
        burgundy,
        collection,
        root,
        radial_segments=8,
        subdivision_levels=1,
        subdivision_type="SIMPLE",
        smooth=False,
        profile_power=0.82,
        ring_shadows=[0.02, 0.0, 0.03, 0.07, 0.10, 0.06, 0.04, 0.03, 0.08],
    )

    toe_spread = 0.19 if kind == "Fore" else 0.23
    for toe_index, x_offset in enumerate(
        (-toe_spread, 0.0, toe_spread), start=1
    ):
        toe_start = (
            toe_origin[0] + x_offset * 0.42,
            toe_origin[1] - 0.02,
            toe_origin[2],
        )
        toe_knuckle = (
            toe_origin[0] + x_offset,
            toe_origin[1] + 0.22,
            toe_origin[2] - 0.035,
        )
        toe_end = (
            toe_origin[0] + x_offset * 1.30,
            toe_origin[1] + 0.48,
            toe_origin[2] - 0.20,
        )
        add_segment(
            f"Leg_{label}_Toe_{toe_index}",
            toe_start,
            toe_knuckle,
            0.11,
            0.095,
            burgundy,
            collection,
            root,
            vertices=6,
            smooth=False,
        )
        add_segment(
            f"Leg_{label}_Claw_{toe_index}",
            toe_knuckle,
            toe_end,
            0.10,
            0.0,
            charcoal,
            collection,
            root,
            vertices=6,
            smooth=False,
        )

    dew_start = (
        foot[0] - 0.08 * s,
        foot[1] - 0.04,
        foot[2] + 0.03,
    )
    add_segment(
        f"Leg_{label}_Dewclaw",
        dew_start,
        (dew_start[0] - 0.12 * s, dew_start[1] - 0.21, dew_start[2] - 0.10),
        0.060,
        0.0,
        charcoal,
        collection,
        root,
        vertices=6,
        smooth=False,
    )


def add_dragon(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> None:
    red = materials["red"]
    ember_light = materials["ember_light"]
    burgundy = materials["burgundy"]
    gold = materials["gold"]
    membrane = materials["membrane"]
    charcoal = materials["charcoal"]
    teal = materials["teal"]

    add_anatomical_loft(
        "Torso_Neck_Loft",
        [
            (0.0, -2.30, 2.25),
            (0.0, -1.88, 2.33),
            (0.0, -1.42, 2.40),
            (0.0, -0.88, 2.45),
            (0.0, -0.34, 2.52),
            (0.0, 0.18, 2.66),
            (0.0, 0.53, 2.92),
            (0.0, 0.82, 3.18),
            (0.0, 1.15, 3.58),
            (0.0, 1.43, 3.93),
            (0.0, 1.78, 4.22),
            (0.0, 2.12, 4.42),
            (0.0, 2.48, 4.55),
        ],
        [
            (0.50, 0.46),
            (0.86, 0.70),
            (0.94, 0.74),
            (0.58, 0.50),
            (0.61, 0.58),
            (0.85, 0.76),
            (1.05, 0.86),
            (0.65, 0.60),
            (0.42, 0.38),
            (0.35, 0.32),
            (0.30, 0.27),
            (0.27, 0.24),
            (0.28, 0.23),
        ],
        red,
        burgundy,
        collection,
        root,
        radial_segments=18,
        subdivision_levels=2,
        subdivision_type="CATMULL_CLARK",
        smooth=True,
        profile_power=0.84,
        ring_shadows=[
            0.08,
            0.02,
            0.0,
            0.12,
            0.08,
            0.03,
            0.0,
            0.04,
            0.08,
            0.06,
            0.04,
            0.02,
            0.06,
        ],
    )

    add_angular_head_cranium(red, burgundy, collection, root)
    add_diamond_prism(
        "Head_ForeheadCrest",
        (0.0, 3.48, 4.91),
        0.27,
        0.17,
        0.26,
        ember_light,
        collection,
        root,
    )
    add_frustum_box(
        "Head_MidSnout",
        (0.0, 3.58, 4.50),
        (0.0, 4.04, 4.38),
        0.80,
        0.44,
        0.58,
        0.31,
        red,
        collection,
        root,
    )
    add_frustum_box(
        "Head_Nose",
        (0.0, 3.99, 4.39),
        (0.0, 4.46, 4.27),
        0.58,
        0.31,
        0.25,
        0.20,
        red,
        collection,
        root,
    )
    add_frustum_box(
        "Jaw_Main",
        (0.0, 3.54, 4.22),
        (0.0, 4.34, 4.07),
        0.67,
        0.26,
        0.39,
        0.17,
        burgundy,
        collection,
        root,
    )
    add_diamond_prism(
        "Jaw_ThroatPlate",
        (0.0, 3.68, 4.10),
        0.23,
        0.10,
        0.32,
        gold,
        collection,
        root,
    )

    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        s = float(side)
        add_diamond_prism(
            f"EyeSocket_{label}",
            (0.31 * s, 3.78, 4.64),
            0.17,
            0.090,
            0.10,
            burgundy,
            collection,
            root,
        )
        add_diamond_prism(
            f"Eye_{label}_Iris",
            (0.33 * s, 3.84, 4.63),
            0.11,
            0.055,
            0.12,
            teal,
            collection,
            root,
        )
        add_diamond_prism(
            f"Eye_{label}_Pupil",
            (0.335 * s, 3.90, 4.63),
            0.020,
            0.045,
            0.13,
            charcoal,
            collection,
            root,
        )
        add_diamond_prism(
            f"Eye_{label}_Highlight",
            (0.355 * s, 3.91, 4.656),
            0.006,
            0.006,
            0.14,
            gold,
            collection,
            root,
        )
        add_segment(
            f"Brow_{label}",
            (0.08 * s, 3.71, 4.80),
            (0.56 * s, 3.52, 4.67),
            0.12,
            0.055,
            burgundy,
            collection,
            root,
            vertices=6,
            smooth=False,
        )
        add_segment(
            f"Brow_Ridge_{label}",
            (0.13 * s, 3.85, 4.73),
            (0.51 * s, 3.70, 4.59),
            0.075,
            0.035,
            burgundy,
            collection,
            root,
            vertices=6,
            smooth=False,
        )
        add_cheek_wedge(side, red, burgundy, collection, root)
        horn_mid = (0.36 * s, 2.83, 5.43)
        add_segment(
            f"Horn_{label}_Base",
            (0.27 * s, 3.13, 4.88),
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
            (0.60 * s, 2.32, 5.89),
            0.105,
            0.0,
            charcoal,
            collection,
            root,
            vertices=8,
        )
        add_segment(
            f"CheekSpike_{label}",
            (0.53 * s, 3.18, 4.38),
            (0.90 * s, 2.86, 4.30),
            0.105,
            0.0,
            charcoal,
            collection,
            root,
            vertices=6,
            smooth=False,
        )
        add_ico(
            f"Nostril_{label}",
            (0.105 * s, 4.39, 4.30),
            (0.052, 0.032, 0.036),
            charcoal,
            collection,
            root,
            subdivisions=2,
        )
        add_segment(
            f"Jaw_MouthLine_{label}",
            (0.17 * s, 3.85, 4.17),
            (0.19 * s, 4.38, 4.13),
            0.032,
            0.018,
            charcoal,
            collection,
            root,
            vertices=6,
            smooth=False,
        )
        add_segment(
            f"Jaw_Tooth_{label}",
            (0.23 * s, 4.12, 4.10),
            (0.23 * s, 4.14, 3.93),
            0.050,
            0.0,
            gold,
            collection,
            root,
            vertices=6,
            smooth=False,
        )

    plate_specs = [
        ((0.0, 2.60, 4.25), 0.22, 0.26, 0.24),
        ((0.0, 2.28, 4.03), 0.27, 0.32, 0.26),
        ((0.0, 1.93, 3.72), 0.33, 0.40, 0.29),
        ((0.0, 1.60, 3.35), 0.40, 0.48, 0.32),
        ((0.0, 1.30, 2.91), 0.47, 0.56, 0.35),
        ((0.0, 1.05, 2.45), 0.36, 0.43, 0.32),
    ]
    for index, (center, top_width, bottom_width, height) in enumerate(
        plate_specs, start=1
    ):
        add_belly_plate(
            f"ChestPlate_{index}",
            center,
            top_width,
            bottom_width,
            height,
            0.05,
            gold,
            burgundy,
            collection,
            root,
        )

    tail_points = [
        (0.0, -1.72, 2.30),
        (0.0, -2.68, 2.16),
        (0.0, -3.66, 2.02),
        (0.0, -4.65, 1.95),
        (0.0, -5.63, 1.98),
        (0.0, -6.55, 2.08),
    ]
    tail_radii = [0.62, 0.50, 0.39, 0.29, 0.20, 0.080]
    red_color = tuple(red.get("vertex_color", (1.0, 0.1, 0.02, 1.0)))
    burgundy_color = tuple(
        burgundy.get("vertex_color", (0.26, 0.02, 0.02, 1.0))
    )

    def tail_color(progress: float) -> tuple[float, float, float, float]:
        blend = min(0.66, max(0.0, progress * 0.66))
        return tuple(
            start + (end - start) * blend
            for start, end in zip(red_color, burgundy_color)
        )

    for index, (start, end) in enumerate(
        zip(tail_points, tail_points[1:]), start=1
    ):
        tail_section = add_segment(
            f"Tail_{index}",
            start,
            end,
            tail_radii[index - 1],
            tail_radii[index],
            red,
            collection,
            root,
            vertices=10,
        )
        recolor_segment_gradient(
            tail_section,
            tail_color((index - 1) / 5.0),
            tail_color(index / 5.0),
        )

    add_segment(
        "TailFin_Stem",
        tail_points[-1],
        (0.0, -6.92, 1.96),
        0.12,
        0.18,
        red,
        collection,
        root,
        vertices=6,
    )
    add_octahedron(
        "TailFin_Diamond",
        (0.0, -7.12, 1.96),
        0.46,
        0.40,
        0.62,
        red,
        collection,
        root,
    )
    add_diamond_prism(
        "TailFin_FrontInlay",
        (0.0, -7.12, 1.96),
        0.18,
        0.26,
        0.70,
        gold,
        collection,
        root,
    )
    add_side_diamond_prism(
        "TailFin_SideInlay",
        (0.0, -7.12, 1.96),
        0.135,
        0.22,
        0.70,
        gold,
        collection,
        root,
    )

    spine_specs = [
        (1, (0.0, 2.28, 4.62), (0.0, 2.18, 5.22), 0.20),
        (3, (0.0, 1.62, 4.13), (0.0, 1.49, 4.79), 0.22),
        (5, (0.0, 0.34, 3.40), (0.0, 0.22, 4.01), 0.21),
        (7, (0.03, -1.92, 2.69), (0.03, -1.99, 3.18), 0.18),
        (9, (-0.01, -3.30, 2.17), (-0.01, -3.36, 2.58), 0.14),
        (11, (-0.03, -5.35, 2.05), (-0.03, -5.41, 2.35), 0.10),
    ]
    for index, base, tip, radius in spine_specs:
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

    # Overlapping shoulder scutes add a readable dorsal rhythm without adding
    # runtime draw calls: the exporter joins them into Dragon_Body.
    for side in (-1, 1):
        for index, (y, z, width) in enumerate(((0.48, 3.57, 0.24), (0.08, 3.28, 0.22), (-0.32, 3.01, 0.18))):
            add_diamond_prism(
                f"ShoulderScale_{side}_{index}",
                (side * (0.48 - index * 0.05), y, z),
                width, 0.11, 0.30, ember_light, collection, root,
            )

    add_wing(-1, red, burgundy, membrane, charcoal, teal, collection, root)
    add_wing(1, red, burgundy, membrane, charcoal, teal, collection, root)
    add_leg("Fore", -1, red, burgundy, charcoal, collection, root)
    add_leg("Fore", 1, red, burgundy, charcoal, collection, root)
    add_leg("Hind", -1, red, burgundy, charcoal, collection, root)
    add_leg("Hind", 1, red, burgundy, charcoal, collection, root)

    head_prefixes = (
        "Head_",
        "Jaw_",
        "Horn_",
        "EyeSocket_",
        "Eye_",
        "Brow_",
        "CheekSpike_",
        "Nostril_",
    )
    for obj in collection.objects:
        if obj.type == "MESH" and obj.name.startswith(head_prefixes):
            obj.location.y -= 0.35


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


def validate_source_contract(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    stats: dict[str, object],
) -> None:
    required_parts = (
        "Torso_Neck_Loft",
        "Head_Cranium",
        "Head_Cheek_L",
        "Head_Cheek_R",
        "Jaw_Main",
        "Wing_L_Membrane",
        "Wing_R_Membrane",
        "Wing_L_ArmLoft",
        "Wing_R_ArmLoft",
        "Leg_Fore_L_LimbLoft",
        "Leg_Fore_R_LimbLoft",
        "Leg_Hind_L_LimbLoft",
        "Leg_Hind_R_LimbLoft",
        "Tail_1",
        "Tail_2",
        "Tail_3",
        "Tail_4",
        "Tail_5",
    )
    collection_names = {obj.name for obj in collection.objects}
    missing = [name for name in required_parts if name not in collection_names]
    if missing:
        raise RuntimeError(
            "RC7 dragon source contract is incomplete: " + ", ".join(missing)
        )
    if root.get("asset_version") != "0.7":
        raise RuntimeError("RC7 dragon source has the wrong asset version")
    triangles = int(stats["triangles"])
    if not 16_000 <= triangles <= 20_500:
        raise RuntimeError(
            f"RC7 dragon source triangle envelope exceeded: {triangles}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-renders", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not REFERENCE_PATH.exists():
        raise FileNotFoundError(f"Missing reference image: {REFERENCE_PATH}")

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    clear_file()
    scene = bpy.context.scene
    scene.name = "Skyknot_Dragon_Visual_Remaster_v08"
    bpy.context.preferences.filepaths.save_version = 0

    dragon_collection = make_collection(DRAGON_COLLECTION_NAME)
    environment_collection = make_collection(ENV_COLLECTION_NAME)

    root = bpy.data.objects.new("DragonRoot", None)
    root.empty_display_type = "ARROWS"
    root.empty_display_size = 1.0
    root["asset_version"] = "0.7"
    root["blockout_iteration"] = 8
    root["visual_revision"] = "m45-cambered-wings-sculpted-torso"
    root["asset_status"] = "rc7-visual-remaster"
    root["asset_license"] = "project-authored"
    root["anatomy_contract"] = "rc7-flight-athlete-v1"
    root["edge_treatment"] = "bevel-and-smooth-normals"
    root["forward_axis"] = "+Y"
    root["up_axis"] = "+Z"
    root["reference"] = str(REFERENCE_PATH.relative_to(ROOT))
    dragon_collection.objects.link(root)

    materials = {
        "red": make_material(
            "M_Dragon_Ember", (0.70, 0.105, 0.040, 1.0), 0.60
        ),
        "ember_light": make_material(
            "M_Dragon_EmberLight", (0.96, 0.38, 0.12, 1.0), 0.57
        ),
        "burgundy": make_material(
            "M_Dragon_Burgundy", (0.21, 0.035, 0.042, 1.0), 0.80
        ),
        "gold": make_material(
            "M_Dragon_Gold", (1.0, 0.50, 0.055, 1.0), 0.68
        ),
        "membrane": make_material(
            "M_Wing_Membrane",
            (0.66, 0.24, 0.055, 1.0),
            0.64,
            tip_color=(1.0, 0.80, 0.34, 1.0),
        ),
        "charcoal": make_material(
            "M_Horn_Charcoal", (0.022, 0.016, 0.028, 1.0), 0.86
        ),
        "teal": make_material(
            "M_Rune_Teal", (0.0, 0.48, 0.56, 1.0), 0.44, 0.02, 1.0
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

    stats = collect_mesh_stats(dragon_collection)
    validate_source_contract(dragon_collection, root, stats)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    rendered_files = [] if args.skip_renders else render_turntable(camera, target)
    if not args.skip_renders:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    report = {
        "asset": "skyknit-dragon-v08",
        "status": "rc7-visual-remaster-source",
        "iteration": 8,
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
