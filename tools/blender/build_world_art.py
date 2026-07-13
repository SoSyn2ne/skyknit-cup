"""Build the project-authored RC7 world art source and runtime GLBs.

Run with Blender 4.5 LTS:
blender --background --python tools/blender/build_world_art.py
"""

from __future__ import annotations

import math
from pathlib import Path
from uuid import uuid4

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "assets" / "source" / "world" / "skyknit-world-rc7.blend"
OUTPUT_DIR = ROOT / "public" / "assets" / "models" / "world"

ASSET_VERSION = "0.7"
GEOMETRY_STYLE = "handcrafted-layered"
TAU = math.pi * 2.0


def clear_file() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
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
        vertex_color.layer_name = "WorldColor"
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


def apply_vertex_color(mesh: bpy.types.Mesh, material: bpy.types.Material) -> None:
    color = tuple(material.get("vertex_color", (1.0, 1.0, 1.0, 1.0)))
    attribute = mesh.color_attributes.get("WorldColor")
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="WorldColor", type="FLOAT_COLOR", domain="POINT"
        )
    if mesh.vertices:
        z_values = [vertex.co.z for vertex in mesh.vertices]
        z_min = min(z_values)
        z_span = max(max(z_values) - z_min, 1e-5)
    else:
        z_min = 0.0
        z_span = 1.0
    for index, item in enumerate(attribute.data):
        vertex = mesh.vertices[index]
        height = (vertex.co.z - z_min) / z_span
        facet = 0.5 + 0.5 * math.sin(
            vertex.co.x * 1.731
            + vertex.co.y * 2.417
            + vertex.co.z * 0.913
            + index * 1.219
        )
        shade = 0.68 + height * 0.22 + facet * 0.18
        warmth = 0.96 + facet * 0.08
        item.color = (
            min(1.0, color[0] * shade * warmth),
            min(1.0, color[1] * shade),
            min(1.0, color[2] * shade * (1.04 - facet * 0.05)),
            color[3],
        )
    mesh.color_attributes.active_color = attribute


def move_to_collection(
    obj: bpy.types.Object, collection: bpy.types.Collection
) -> None:
    for current in tuple(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def finish_object(
    obj: bpy.types.Object,
    name: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    obj.name = name
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(material)
    apply_vertex_color(obj.data, material)
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
    subdivisions: int,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=1.0, location=location
    )
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_object(obj, name, material, collection, root)


def add_torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    major_segments: int,
    minor_segments: int,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    return finish_object(
        bpy.context.object, name, material, collection, root
    )


def add_segment(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    vertices: int,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    length = direction.length
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=(start_vector + end_vector) * 0.5,
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(
        direction.normalized()
    )
    return finish_object(obj, name, material, collection, root)


def apply_weighted_normals(obj: bpy.types.Object) -> None:
    """Keep broad architectural planes calm after their hand-cut bevels."""
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    modifier = obj.modifiers.new(name="WeightedCornerNormals", type="WEIGHTED_NORMAL")
    modifier.keep_sharp = True
    modifier.weight = 50
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def add_layered_form(
    name: str,
    location: tuple[float, float, float],
    rings: list[tuple[float, float, float]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    seed: float,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    irregularity: float = 0.08,
    lean: tuple[float, float] = (0.0, 0.0),
) -> bpy.types.Object:
    """Create an authored radial mesh from asymmetrical profile rings."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for ring_index, (z, radius_x, radius_y) in enumerate(rings):
        ring_progress = ring_index / max(1, len(rings) - 1)
        offset_x = (
            math.sin(seed * 1.13 + ring_index * 1.71) * radius_x * 0.035
            + (ring_progress - 0.5) * lean[0]
        )
        offset_y = (
            math.cos(seed * 0.79 + ring_index * 1.37) * radius_y * 0.035
            + (ring_progress - 0.5) * lean[1]
        )
        for index in range(segments):
            angle = (index / segments) * TAU
            wobble = (
                1.0
                + math.sin(angle * 3.0 + seed) * irregularity
                + math.cos(angle * 5.0 - seed * 0.61) * irregularity * 0.48
            )
            vertices.append(
                (
                    offset_x + math.cos(angle) * radius_x * wobble,
                    offset_y + math.sin(angle) * radius_y * wobble,
                    z,
                )
            )

    for ring_index in range(len(rings) - 1):
        current = ring_index * segments
        following = (ring_index + 1) * segments
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append(
                (
                    current + index,
                    current + next_index,
                    following + next_index,
                    following + index,
                )
            )

    bottom_center = len(vertices)
    vertices.append((0.0, 0.0, rings[0][0]))
    top_center = len(vertices)
    vertices.append((0.0, 0.0, rings[-1][0]))
    top_ring = (len(rings) - 1) * segments
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append((bottom_center, next_index, index))
        faces.append((top_center, top_ring + index, top_ring + next_index))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    return finish_object(obj, name, material, collection, root)


def add_handcut_slab(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    seed: float,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    radius_x, radius_y, half_height = scale
    bevel_height = min(half_height * 0.48, 0.45)
    return add_layered_form(
        name,
        location,
        [
            (-half_height, radius_x * 0.86, radius_y * 0.88),
            (-half_height + bevel_height, radius_x, radius_y),
            (half_height - bevel_height, radius_x * 0.98, radius_y * 0.99),
            (half_height, radius_x * 0.88, radius_y * 0.90),
        ],
        material,
        collection,
        root,
        segments,
        seed,
        rotation,
        irregularity=0.035,
    )


def add_flared_column(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    seed: float,
    top_scale: float = 0.78,
) -> bpy.types.Object:
    half = height * 0.5
    rings = [
        (-half, radius * 1.28, radius * 1.18),
        (-half + min(0.8, height * 0.12), radius * 1.05, radius),
        (-half + height * 0.23, radius * 0.92, radius * 0.88),
        (half - height * 0.22, radius * top_scale, radius * top_scale * 0.94),
        (half - min(0.75, height * 0.1), radius * top_scale * 1.08, radius * top_scale),
        (half, radius * top_scale * 1.22, radius * top_scale * 1.12),
    ]
    return add_layered_form(
        name,
        location,
        rings,
        material,
        collection,
        root,
        segments,
        seed,
        irregularity=0.025,
    )


def add_arch_band(
    name: str,
    location: tuple[float, float, float],
    outer_radius: float,
    inner_radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for index in range(segments + 1):
        angle = math.pi - (index / segments) * math.pi
        for radius, y in (
            (outer_radius, -depth),
            (outer_radius, depth),
            (inner_radius, -depth),
            (inner_radius, depth),
        ):
            vertices.append((math.cos(angle) * radius, y, math.sin(angle) * radius))
    for index in range(segments):
        start = index * 4
        end = (index + 1) * 4
        faces.extend(
            [
                (start, end, end + 1, start + 1),
                (start + 2, start + 3, end + 3, end + 2),
                (start + 1, end + 1, end + 3, start + 3),
                (start, start + 2, end + 2, end),
            ]
        )
    faces.extend([(0, 1, 3, 2), (segments * 4, segments * 4 + 2, segments * 4 + 3, segments * 4 + 1)])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    obj = finish_object(obj, name, material, collection, root)
    apply_weighted_normals(obj)
    return obj


def add_wave_banner(
    name: str,
    location: tuple[float, float, float],
    length: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    sections: int,
    rotation_z: float,
    phase: float,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    thickness = 0.08
    for index in range(sections + 1):
        t = index / sections
        x = t * length
        wave = (
            math.sin(t * math.pi * 2.0 + phase) * 0.62 * t
            + math.sin(t * math.pi * 4.0 + phase * 0.7) * 0.16 * t
        )
        lift = math.sin(t * math.pi * 2.0 + phase + 0.8) * 0.34 * t
        taper = 1.0 - t * 0.30
        for y, z in (
            (wave - thickness, -height * taper * 0.5 + lift),
            (wave + thickness, -height * taper * 0.5 + lift),
            (wave - thickness, height * taper * 0.5 + lift),
            (wave + thickness, height * taper * 0.5 + lift),
        ):
            vertices.append((x, y, z))
    for index in range(sections):
        start = index * 4
        end = (index + 1) * 4
        faces.extend(
            [
                (start, end, end + 2, start + 2),
                (start + 1, start + 3, end + 3, end + 1),
                (start + 2, end + 2, end + 3, start + 3),
                (start, start + 1, end + 1, end),
            ]
        )
    faces.extend([(0, 2, 3, 1), (sections * 4, sections * 4 + 1, sections * 4 + 3, sections * 4 + 2)])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler.z = rotation_z
    return finish_object(obj, name, material, collection, root)


def join_parts(
    parts: list[bpy.types.Object],
    semantic_name: str,
    tag: str,
    root: bpy.types.Object,
) -> bpy.types.Object:
    if not parts:
        raise RuntimeError(f"No parts for {semantic_name}")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = f"{semantic_name}__{tag}"
    joined.data.name = f"{semantic_name}__{tag}_Mesh"
    joined.parent = root
    joined["semantic"] = semantic_name
    joined["geometry_style"] = GEOMETRY_STYLE
    return joined


def create_asset_root(
    region_id: str, lod: str, collection: bpy.types.Collection
) -> tuple[bpy.types.Object, str]:
    tag = f"{region_id.replace('-', '_')}_{lod}"
    root = bpy.data.objects.new(f"RegionRoot__{tag}", None)
    collection.objects.link(root)
    root["asset_version"] = ASSET_VERSION
    root["asset_license"] = "project-authored"
    root["region_id"] = region_id
    root["lod"] = lod
    root["geometry_style"] = GEOMETRY_STYLE
    root["coordinate_contract"] = "rc5-gameplay-local-origin"
    return root, tag


def build_festival_hub(
    lod: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    high = lod == "high"
    tag = f"festival_hub_{lod}"
    collection = make_collection(f"RC7_FESTIVAL_HUB_{lod.upper()}")
    root, tag = create_asset_root("festival-hub", lod, collection)
    radial_count = 16 if high else 8

    airfield: list[bpy.types.Object] = []
    airfield.append(
        add_layered_form(
            f"AirfieldIsland_{tag}",
            (0.0, 0.0, -12.0),
            [
                (-12.0, 8.0, 7.0),
                (-8.0, 25.0, 23.0),
                (-3.0, 48.0, 44.0),
                (3.5, 59.0, 54.0),
                (7.0, 56.0, 52.0),
                (8.0, 51.0, 48.0),
            ],
            materials["festival_earth"],
            collection,
            root,
            96 if high else 36,
            2.7,
            irregularity=0.055,
        )
    )
    for index in range(3):
        airfield.append(
            add_handcut_slab(
                f"AirfieldTerrace_{index}_{tag}",
                (0.0, 0.0, -3.7 + index * 0.48),
                (45.0 - index * 5.5, 42.0 - index * 5.0, 0.36),
                materials["festival_earth"] if index == 1 else materials["festival_stone"],
                collection,
                root,
                64 if high else 24,
                7.0 + index,
            )
        )
    for index in range(radial_count):
        angle = (index / radial_count) * TAU
        radius = 48.0
        airfield.append(
            add_handcut_slab(
                f"AirfieldDock_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, -2.4),
                (5.4, 2.2, 0.7),
                materials["festival_stone"],
                collection,
                root,
                12 if high else 8,
                20.0 + index,
                rotation=(0.0, 0.0, angle),
            )
        )
    garden_count = 12 if high else 6
    for index in range(garden_count):
        angle = (index / garden_count) * TAU + 0.18
        radius = 30.0 + (index % 2) * 5.0
        airfield.append(
            add_handcut_slab(
                f"AirfieldGarden_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, -2.35),
                (4.3, 2.6, 0.45),
                materials["festival_earth"],
                collection,
                root,
                12 if high else 8,
                44.0 + index,
                rotation=(0.0, 0.0, angle + 0.4),
            )
        )
    join_parts(airfield, "FestivalAirfield", tag, root)

    landing = [
        add_handcut_slab(
            f"LandingPadBase_{tag}",
            (0.0, 0.0, -3.15),
            (20.0, 20.0, 0.35),
            materials["festival_stone"],
            collection,
            root,
            64 if high else 24,
            61.0,
        ),
        add_torus(
            f"LandingPadRune_{tag}",
            (0.0, 0.0, -2.75),
            13.0,
            0.45,
            materials["gold"],
            collection,
            root,
            64 if high else 24,
            8 if high else 4,
        ),
    ]
    join_parts(landing, "LandingPad", tag, root)

    tower: list[bpy.types.Object] = [
        add_layered_form(
            f"TowerOriginAnchor_{tag}",
            (-18.0, 14.0, 2.3),
            [(-0.08, 0.08, 0.08), (0.08, 0.06, 0.06)],
            materials["festival_stone"],
            collection,
            root,
            6,
            79.0,
            irregularity=0.0,
        )
    ]
    tower_center = (-24.0, 42.0)
    tower_levels = 4 if high else 3
    level_specs = (
        (2.3, 4.2, 5.3),
        (7.0, 5.0, 4.6),
        (12.4, 5.4, 3.9),
        (18.2, 5.8, 3.3),
    )
    for level, (center_z, height, radius) in enumerate(level_specs[:tower_levels]):
        tower.append(
            add_flared_column(
                f"TowerLevel_{level}_{tag}",
                (*tower_center, center_z),
                radius,
                height,
                materials["festival_stone"],
                collection,
                root,
                20 if high else 10,
                80.0 + level,
                top_scale=0.78,
            )
        )
        tower.append(
            add_layered_form(
                f"TowerRoof_{level}_{tag}",
                (*tower_center, center_z + height * 0.5 + 1.0),
                [
                    (-1.0, radius * 1.24, radius * 1.14),
                    (0.05, radius * 1.08, radius),
                    (0.72, radius * 0.82, radius * 0.76),
                    (1.28, radius * 0.46, radius * 0.42),
                ],
                materials["gold"],
                collection,
                root,
                20 if high else 10,
                90.0 + level,
                irregularity=0.025,
            )
        )
        tower.append(
            add_torus(
                f"TowerBalcony_{level}_{tag}",
                (*tower_center, center_z + height * 0.42),
                radius * 0.98,
                0.28,
                materials["gold"],
                collection,
                root,
                32 if high else 16,
                6 if high else 4,
            )
        )
    tower.append(
        add_flared_column(
            f"TowerSpire_{tag}",
            (*tower_center, 27.0 if high else 23.0),
            1.25,
            10.0 if high else 7.0,
            materials["gold"],
            collection,
            root,
            16 if high else 8,
            103.0,
            top_scale=0.26,
        )
    )
    join_parts(tower, "FestivalTower", tag, root)

    flags: list[bpy.types.Object] = []
    flag_count = 16 if high else 8
    for index in range(flag_count):
        angle = (index / flag_count) * TAU + 0.14
        radius = 34.0 + (index % 2) * 8.0
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius
        flags.append(
            add_segment(
                f"FlagPole_{index}_{tag}",
                (x, y, -2.2),
                (x, y, 9.0 + (index % 3)),
                0.28,
                materials["charcoal"],
                collection,
                root,
                10 if high else 6,
            )
        )
        flag = add_wave_banner(
            f"FlagCloth_{index}_{tag}",
            (x, y, 7.4 + (index % 3)),
            5.4,
            2.7,
            materials["cloth"],
            collection,
            root,
            6 if high else 3,
            angle + math.pi / 2,
            index * 0.73,
        )
        flags.append(flag)
    join_parts(flags, "FestivalFlags", tag, root)

    race_arch: list[bpy.types.Object] = []
    for side in (-1.0, 1.0):
        race_arch.append(
            add_flared_column(
                f"RaceArchPylon_{side}_{tag}",
                (34.0 + side * 8.2, 10.0, 5.0),
                3.2,
                18.0,
                materials["festival_stone"],
                collection,
                root,
                18 if high else 9,
                120.0 + side,
                top_scale=0.72,
            )
        )
        race_arch.append(
            add_layered_form(
                f"RaceArchCap_{side}_{tag}",
                (34.0 + side * 8.2, 10.0, 14.5),
                [(-1.5, 4.6, 4.0), (0.4, 3.4, 3.0), (1.5, 2.3, 2.0)],
                materials["gold"],
                collection,
                root,
                18 if high else 9,
                130.0 + side,
                irregularity=0.02,
            )
        )
    race_arch.append(
        add_arch_band(
            f"RaceArchCrown_{tag}",
            (34.0, 10.0, 10.0),
            12.0,
            8.0,
            2.8,
            materials["festival_stone"],
            collection,
            root,
            28 if high else 12,
        )
    )
    race_arch.append(
        add_torus(
            f"RaceArchBeacon_{tag}",
            (34.0, 10.0, 12.0),
            7.0,
            0.85,
            materials["gold"],
            collection,
            root,
            64 if high else 24,
            10 if high else 5,
            rotation=(math.pi / 2, 0.0, 0.0),
        )
    )
    race_arch.append(
        add_ico(
            f"RaceArchCrest_{tag}",
            (34.0, 10.0, 23.0),
            (1.5, 1.0, 2.6),
            materials["teal"],
            collection,
            root,
            2 if high else 1,
        )
    )
    join_parts(race_arch, "RaceArch", tag, root)

    accents: list[bpy.types.Object] = []
    lantern_count = 24 if high else 8
    for index in range(lantern_count):
        angle = (index / lantern_count) * TAU
        radius = 27.0
        accents.append(
            add_ico(
                f"FestivalLantern_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 1.0 + (index % 3) * 0.45),
                (0.65, 0.65, 1.0),
                materials["gold"],
                collection,
                root,
                2 if high else 1,
            )
        )
    join_parts(accents, "FestivalLanterns", tag, root)

    return collection, root


def build_wind_canyon(
    lod: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    high = lod == "high"
    collection = make_collection(f"RC7_WIND_CANYON_{lod.upper()}")
    root, tag = create_asset_root("wind-canyon", lod, collection)

    cliffs: list[bpy.types.Object] = []
    rock_count = 32 if high else 14
    for index in range(rock_count):
        side = -1.0 if index % 2 == 0 else 1.0
        lane = index // 2
        angle = lane * 2.3999632297
        x = side * (38.0 + (lane % 5) * 7.5)
        y = -68.0 + (lane % 12) * 13.0 + math.sin(angle) * 5.0
        z = -22.0 + (lane % 6) * 4.4
        scale = (
            12.0 + (lane % 4) * 3.2,
            9.0 + (lane % 3) * 3.6,
            22.0 + (lane % 5) * 5.2,
        )
        rock = add_layered_form(
            f"CanyonRock_{index}_{tag}",
            (x, y, z),
            [
                (-scale[2], scale[0] * 0.34, scale[1] * 0.36),
                (-scale[2] * 0.55, scale[0] * 0.78, scale[1] * 0.82),
                (-scale[2] * 0.08, scale[0], scale[1]),
                (scale[2] * 0.48, scale[0] * 0.72, scale[1] * 0.67),
                (scale[2], scale[0] * 0.18, scale[1] * 0.2),
            ],
            materials["canyon_strata"] if index % 4 == 0 else materials["canyon_rock"],
            collection,
            root,
            16 if high else 8,
            170.0 + index * 1.41,
            irregularity=0.12,
        )
        rock.rotation_euler.z = side * (0.08 + (lane % 4) * 0.035)
        cliffs.append(rock)
    spire_count = 12 if high else 6
    for index in range(spire_count):
        side = -1.0 if index % 2 == 0 else 1.0
        lane = index // 2
        height = 52.0 + (lane % 4) * 8.0
        radius = 12.0 + (lane % 3) * 2.5
        cliffs.append(
            add_layered_form(
                f"CanyonSpire_{index}_{tag}",
                (side * (58.0 + (lane % 3) * 10.0), -48.0 + lane * 16.0, 9.0 + (lane % 3) * 5.0),
                [
                    (-height * 0.5, radius * 1.25, radius),
                    (-height * 0.32, radius, radius * 0.86),
                    (-height * 0.02, radius * 0.76, radius * 0.64),
                    (height * 0.32, radius * 0.46, radius * 0.38),
                    (height * 0.47, radius * 0.24, radius * 0.18),
                    (height * 0.5, radius * 0.12, radius * 0.08),
                ],
                materials["canyon_rock"],
                collection,
                root,
                18 if high else 8,
                rotation=(side * 0.12, 0.08 * math.sin(lane), 0.0),
                seed=230.0 + index,
                irregularity=0.13,
                lean=(side * (7.0 + lane % 3), 2.5 + lane % 2),
            )
        )
    for side in (-1.0, 1.0):
        cliffs.append(
            add_layered_form(
                f"CanyonShelf_{side}_{tag}",
                (side * 60.0, 42.0, -18.0),
                [
                    (-10.0, 10.0, 19.0),
                    (-4.0, 21.0, 26.0),
                    (2.0, 26.0, 29.0),
                    (7.0, 23.0, 25.0),
                    (9.0, 18.0, 21.0),
                ],
                materials["canyon_strata"],
                collection,
                root,
                48 if high else 20,
                260.0 + side,
                irregularity=0.075,
            )
        )
    join_parts(cliffs, "CanyonCliffs", tag, root)

    landing_parts = [
        add_layered_form(
            f"CanyonLandingShelf_{tag}",
            (0.0, -4.0, -14.0),
            [
                (-8.0, 10.0, 9.0),
                (-4.0, 22.0, 19.0),
                (1.5, 29.0, 25.0),
                (6.0, 25.0, 22.0),
                (8.0, 20.0, 18.0),
            ],
            materials["canyon_rock"],
            collection,
            root,
            48 if high else 20,
            280.0,
            irregularity=0.07,
        ),
        add_handcut_slab(
            f"CanyonLandingPad_{tag}",
            (0.0, 0.0, -9.55),
            (18.0, 18.0, 0.4),
            materials["teal"],
            collection,
            root,
            48 if high else 20,
            281.0,
        ),
        add_torus(
            f"CanyonLandingRune_{tag}",
            (0.0, 0.0, -9.1),
            11.0,
            0.38,
            materials["teal"],
            collection,
            root,
            48 if high else 20,
            8 if high else 4,
        ),
    ]
    join_parts(landing_parts, "LandingPad", tag, root)

    tunnel: list[bpy.types.Object] = []
    tunnel.append(
        add_layered_form(
            f"WindTunnelAnchor_{tag}",
            (22.0, 34.0, -8.0),
            [(-0.08, 0.08, 0.08), (0.08, 0.06, 0.06)],
            materials["canyon_rock"],
            collection,
            root,
            6,
            310.0,
            irregularity=0.0,
        )
    )
    for side in (-1.0, 1.0):
        tunnel.append(
            add_layered_form(
                f"WindTunnelButtress_{side}_{tag}",
                (side * 20.0, 50.0, -12.0),
                [
                    (-10.0, 7.5, 8.5),
                    (-4.0, 10.0, 9.0),
                    (4.0, 8.0, 7.0),
                    (10.0, 4.4, 4.0),
                ],
                materials["canyon_rock"],
                collection,
                root,
                18 if high else 9,
                314.0 + side,
                irregularity=0.09,
                lean=(side * 2.5, 0.8),
            )
        )
    tunnel.append(
        add_arch_band(
            f"WindTunnelArch_{tag}",
            (0.0, 50.0, -7.0),
            22.0,
            18.0,
            4.5,
            materials["canyon_strata"],
            collection,
            root,
            36 if high else 14,
        )
    )
    tunnel.append(
        add_arch_band(
            f"WindTunnelInnerRim_{tag}",
            (0.0, 45.2, -7.0),
            18.6,
            17.6,
            0.42,
            materials["teal"],
            collection,
            root,
            30 if high else 12,
        )
    )
    rib_count = 4 if high else 2
    for index in range(rib_count):
        offset_y = -2.8 + index * (5.6 / max(1, rib_count - 1))
        tunnel.append(
            add_arch_band(
                f"WindTunnelRib_{index}_{tag}",
                (0.0, 50.0 + offset_y, -7.0),
                18.7,
                17.4,
                0.24,
                materials["canyon_strata"] if index % 2 == 0 else materials["canyon_rock"],
                collection,
                root,
                24 if high else 10,
            )
        )
    for index in range(3):
        ring = add_torus(
            f"WindFlowRing_{index}_{tag}",
            (0.0, 24.0 + index * 18.0, 7.0 + index * 1.4),
            9.0 + index * 1.2,
            0.30,
            materials["teal"],
            collection,
            root,
            48 if high else 20,
            8 if high else 4,
            rotation=(math.pi / 2, 0.0, 0.0),
        )
        tunnel.append(ring)
    join_parts(tunnel, "WindTunnel", tag, root)

    bridge: list[bpy.types.Object] = []
    plank_count = 20 if high else 11
    for index in range(plank_count):
        t = index / (plank_count - 1)
        x = -38.0 + t * 76.0
        if abs(x) < (7.0 if high else 10.0):
            continue
        sag = -2.5 - 3.5 * (1.0 - abs(x) / 38.0)
        bridge.append(
            add_handcut_slab(
                f"BridgePlank_{index}_{tag}",
                (x, -34.0, sag),
                (2.2, 5.2, 0.48),
                materials["wood"],
                collection,
                root,
                10 if high else 8,
                350.0 + index,
                rotation=(0.0, 0.04 * math.sin(index * 1.7), 0.08 * math.sin(index)),
            )
        )
    rope_segments = 16 if high else 8
    for side_y in (-39.0, -29.0):
        previous = (-40.0, side_y, 5.0)
        for index in range(1, rope_segments + 1):
            t = index / rope_segments
            x = -40.0 + t * 80.0
            z = 5.0 - math.sin(t * math.pi) * 9.0
            current = (x, side_y, z)
            bridge.append(
                add_segment(
                    f"BridgeRope_{side_y}_{index}_{tag}",
                    previous,
                    current,
                    0.22,
                    materials["charcoal"],
                    collection,
                    root,
                    8 if high else 5,
                )
            )
            previous = current
    for side in (-1.0, 1.0):
        bridge.append(
            add_flared_column(
                f"BridgeAbutment_{side}_{tag}",
                (side * 42.0, -34.0, 0.0),
                5.8,
                15.0,
                materials["canyon_rock"],
                collection,
                root,
                18 if high else 9,
                390.0 + side,
                top_scale=0.82,
            )
        )
    join_parts(bridge, "BrokenBridge", tag, root)
    return collection, root


def build_cloud_ruins(
    lod: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    high = lod == "high"
    collection = make_collection(f"RC7_CLOUD_RUINS_{lod.upper()}")
    root, tag = create_asset_root("cloud-ruins", lod, collection)

    temple: list[bpy.types.Object] = []
    rubble_count = 24 if high else 10
    for index in range(rubble_count):
        angle = (index / rubble_count) * TAU
        radius = 36.0 + (index % 4) * 6.0
        temple.append(
            add_layered_form(
                f"TempleFoundationRock_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, -11.0 - (index % 3) * 1.8),
                [
                    (-7.0 - index % 3, 4.0, 3.5),
                    (-3.5, 8.0 + index % 4, 7.0 + index % 3),
                    (0.0, 11.0 + index % 4, 9.0 + index % 3),
                    (4.0, 8.0 + index % 3, 7.0 + index % 2),
                    (7.0 + index % 2, 3.0, 2.8),
                ],
                materials["ruin_dark"],
                collection,
                root,
                14 if high else 8,
                420.0 + index * 1.7,
                rotation=(0.12 * math.sin(index), 0.08 * math.cos(index), angle),
                irregularity=0.10,
            )
        )
    for level in range(4 if high else 3):
        temple.append(
            add_handcut_slab(
                f"TempleTerrace_{level}_{tag}",
                (0.0, 0.0, -7.5 + level * 1.4),
                (44.0 - level * 5.5, 41.0 - level * 5.0, 1.0),
                materials["ruin_dark"] if level == 1 else materials["ruin_stone"],
                collection,
                root,
                64 if high else 24,
                470.0 + level,
            )
        )
    temple.extend(
        [
            add_flared_column(
                f"TempleHallLeft_{tag}",
                (-10.5, 52.0, 3.0),
                4.8,
                16.0,
                materials["ruin_stone"],
                collection,
                root,
                18 if high else 9,
                481.0,
                top_scale=0.82,
            ),
            add_flared_column(
                f"TempleHallRight_{tag}",
                (10.5, 52.0, 3.0),
                4.8,
                16.0,
                materials["ruin_stone"],
                collection,
                root,
                18 if high else 9,
                482.0,
                top_scale=0.82,
            ),
            add_handcut_slab(
                f"TempleHallLintel_{tag}",
                (0.0, 52.0, 8.5),
                (6.5, 10.0, 2.2),
                materials["ruin_stone"],
                collection,
                root,
                16 if high else 8,
                483.0,
            ),
            add_handcut_slab(
                f"TempleDoorShadow_{tag}",
                (0.0, 58.2, 2.0),
                (5.0, 0.5, 6.0),
                materials["ruin_dark"],
                collection,
                root,
                12 if high else 8,
                484.0,
            ),
            add_layered_form(
                f"TempleRoof_{tag}",
                (0.0, 52.0, 12.0),
                [
                    (-2.0, 18.0, 14.0),
                    (-0.8, 16.5, 12.8),
                    (0.4, 13.0, 10.0),
                    (1.35, 9.0, 7.2),
                    (2.0, 5.0, 4.2),
                    (2.55, 2.2, 2.0),
                ],
                materials["ruin_dark"],
                collection,
                root,
                24 if high else 12,
                485.0,
                irregularity=0.025,
            ),
            add_arch_band(
                f"TemplePortalCrown_{tag}",
                (0.0, 45.0, 2.0),
                13.0,
                8.0,
                2.2,
                materials["ruin_gold"],
                collection,
                root,
                30 if high else 12,
            ),
        ]
    )
    join_parts(temple, "CloudTemple", tag, root)

    landing = [
        add_handcut_slab(
            f"RuinsLandingPad_{tag}",
            (0.0, 0.0, -3.55),
            (18.0, 18.0, 0.375),
            materials["ruin_gold"],
            collection,
            root,
            56 if high else 24,
            500.0,
        ),
        add_torus(
            f"RuinsLandingRune_{tag}",
            (0.0, 0.0, -3.1),
            11.5,
            0.42,
            materials["teal"],
            collection,
            root,
            56 if high else 24,
            8 if high else 4,
        ),
    ]
    join_parts(landing, "LandingPad", tag, root)

    pillars: list[bpy.types.Object] = [
        add_layered_form(
            f"RunePillarOriginAnchor_{tag}",
            (29.0, 0.0, 2.8),
            [(-0.08, 0.08, 0.08), (0.08, 0.06, 0.06)],
            materials["ruin_stone"],
            collection,
            root,
            6,
            519.0,
            irregularity=0.0,
        )
    ]
    pillar_positions = [
        (-22.0, 28.0),
        (22.0, 28.0),
        (-24.0, 40.0),
        (24.0, 40.0),
        (-20.0, 52.0),
        (20.0, 52.0),
        (-9.0, 62.0),
        (9.0, 62.0),
        (-28.0, 58.0),
        (28.0, 58.0),
    ]
    visible_positions = pillar_positions if high else pillar_positions[:6]
    for index, (x, y) in enumerate(visible_positions):
        angle = math.atan2(y, x)
        height = 10.0 + (index % 3) * 1.8
        pillars.append(
            add_flared_column(
                f"RunePillarShaft_{index}_{tag}",
                (x, y, -2.2 + height * 0.5),
                1.35 + (index % 2) * 0.2,
                height,
                materials["ruin_stone"],
                collection,
                root,
                14 if high else 8,
                520.0 + index,
                top_scale=0.74,
            )
        )
        pillars.append(
            add_handcut_slab(
                f"RunePillarCapital_{index}_{tag}",
                (x, y, -1.8 + height),
                (2.5, 2.5, 0.75),
                materials["ruin_stone"],
                collection,
                root,
                12 if high else 8,
                540.0 + index,
                rotation=(0.0, 0.0, angle),
            )
        )
        pillars.append(
            add_ico(
                f"RunePillarGlyph_{index}_{tag}",
                (x, y, height + 0.5),
                (0.75, 0.75, 1.1),
                materials["teal"],
                collection,
                root,
                2 if high else 1,
            )
        )
    join_parts(pillars, "RunePillars", tag, root)

    steps: list[bpy.types.Object] = []
    step_count = 18 if high else 9
    for index in range(step_count):
        t = index / max(1, step_count - 1)
        steps.append(
            add_handcut_slab(
                f"TempleStep_{index}_{tag}",
                (math.sin(index * 1.3) * 0.22, 12.0 + t * 34.0, -3.8 + t * 10.0),
                (9.6 - t * 2.3 + math.sin(index * 1.7) * 0.38, 1.0, 0.5),
                materials["ruin_stone"],
                collection,
                root,
                10 if high else 8,
                580.0 + index,
            )
        )
    for side in (-1.0, 1.0):
        steps.append(
            add_layered_form(
                f"TempleStairRail_{side}_{tag}",
                (side * 10.5, 32.0, 2.8),
                [
                    (-1.8, 1.2, 11.0),
                    (-0.8, 1.45, 11.5),
                    (1.1, 1.1, 11.0),
                    (1.8, 0.78, 10.3),
                ],
                materials["ruin_stone"],
                collection,
                root,
                16 if high else 8,
                610.0 + side,
                rotation=(0.0, side * -0.17, 0.0),
                irregularity=0.025,
            )
        )
    inset_count = 4 if high else 2
    for index in range(inset_count):
        t = (index + 1) / (inset_count + 1)
        steps.append(
            add_handcut_slab(
                f"TempleStepRuneInset_{index}_{tag}",
                (0.0, 14.0 + t * 30.0, -3.1 + t * 8.8),
                (2.4 - t * 0.5, 0.7, 0.12),
                materials["ruin_gold"],
                collection,
                root,
                10 if high else 8,
                618.0 + index,
            )
        )
    join_parts(steps, "TempleSteps", tag, root)

    slabs: list[bpy.types.Object] = []
    slab_count = 24 if high else 11
    for index in range(slab_count):
        angle = index * 2.3999632297
        radius = 25.0 + (index % 5) * 9.0
        slabs.append(
            add_handcut_slab(
                f"FloatingSlab_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 14.0 + (index % 7) * 3.2),
                (4.5 + index % 3, 3.5 + (index * 2) % 3, 0.75 + (index % 2) * 0.3),
                materials["ruin_dark"] if index % 5 == 0 else materials["ruin_stone"],
                collection,
                root,
                12 if high else 8,
                630.0 + index,
                rotation=(0.1 * math.sin(index), 0.12 * math.cos(index), angle),
            )
        )
    join_parts(slabs, "FloatingSlabs", tag, root)
    return collection, root


def export_asset(
    region_id: str,
    lod: str,
    root: bpy.types.Object,
) -> Path:
    tag = f"{region_id.replace('-', '_')}_{lod}"
    objects = [root, *root.children_recursive]
    original_names = {obj: obj.name for obj in objects}
    for obj in objects:
        suffix = f"__{tag}"
        if obj.name.endswith(suffix):
            obj.name = obj.name[: -len(suffix)]

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    output = OUTPUT_DIR / f"{region_id}-{lod}.glb"
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
        export_vertex_color="MATERIAL",
    )

    for obj, name in original_names.items():
        obj.name = name
    print(f"WORLD_GLTF_EXPORT={output}")
    return output


def main() -> None:
    clear_file()
    materials = {
        "festival_earth": make_material(
            "M_Festival_Earth", (0.17, 0.19, 0.24, 1.0), 0.96
        ),
        "festival_stone": make_material(
            "M_Festival_Stone", (0.38, 0.32, 0.40, 1.0), 0.74
        ),
        "gold": make_material(
            "M_World_Gold", (0.96, 0.57, 0.10, 1.0), 0.34, 0.14, 0.10
        ),
        "cloth": make_material(
            "M_Festival_Cloth", (0.72, 0.075, 0.045, 1.0), 0.68
        ),
        "charcoal": make_material(
            "M_World_Charcoal", (0.06, 0.08, 0.09, 1.0), 0.88
        ),
        "canyon_rock": make_material(
            "M_Canyon_Rock", (0.42, 0.19, 0.095, 1.0), 0.94
        ),
        "canyon_strata": make_material(
            "M_Canyon_Strata", (0.57, 0.31, 0.14, 1.0), 0.88
        ),
        "wood": make_material(
            "M_Canyon_Wood", (0.20, 0.10, 0.055, 1.0), 0.9
        ),
        "teal": make_material(
            "M_World_Rune", (0.08, 0.76, 0.68, 1.0), 0.3, 0.04, 0.32
        ),
        "ruin_stone": make_material(
            "M_Ruin_Stone", (0.58, 0.68, 0.69, 1.0), 0.78
        ),
        "ruin_dark": make_material(
            "M_Ruin_Dark", (0.25, 0.31, 0.34, 1.0), 0.92
        ),
        "ruin_gold": make_material(
            "M_Ruin_Gold", (0.84, 0.61, 0.20, 1.0), 0.42, 0.10, 0.08
        ),
    }

    assets: list[tuple[str, str, bpy.types.Object]] = []
    for lod in ("high", "low"):
        _, asset_root = build_festival_hub(lod, materials)
        assets.append(("festival-hub", lod, asset_root))
        _, asset_root = build_wind_canyon(lod, materials)
        assets.append(("wind-canyon", lod, asset_root))
        _, asset_root = build_cloud_ruins(lod, materials)
        assets.append(("cloud-ruins", lod, asset_root))

    for region_id, lod, asset_root in assets:
        export_asset(region_id, lod, asset_root)

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    staging_path = BLEND_PATH.with_name(
        f".{BLEND_PATH.stem}-{uuid4().hex}.blend"
    )
    try:
        bpy.ops.wm.save_as_mainfile(filepath=str(staging_path))
        staging_path.replace(BLEND_PATH)
    finally:
        staging_path.unlink(missing_ok=True)
    print(f"WORLD_BLEND={BLEND_PATH}")


if __name__ == "__main__":
    main()
