"""Build the project-authored RC5 world art source and runtime GLBs.

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
BLEND_PATH = ROOT / "assets" / "source" / "world" / "skyknit-world-rc5.blend"
OUTPUT_DIR = ROOT / "public" / "assets" / "models" / "world"

ASSET_VERSION = "0.5"
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
    for item in attribute.data:
        item.color = color
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


def apply_bevel(obj: bpy.types.Object, width: float, segments: int) -> None:
    if width <= 0.0:
        return
    modifier = obj.modifiers.new(name="HandCutBevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def add_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    bevel_segments: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(obj, bevel, bevel_segments)
    return finish_object(obj, name, material, collection, root)


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    vertices: int,
    bevel: float = 0.0,
    bevel_segments: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    apply_bevel(obj, bevel, bevel_segments)
    return finish_object(obj, name, material, collection, root)


def add_cone(
    name: str,
    location: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    vertices: int,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    return finish_object(
        bpy.context.object, name, material, collection, root
    )


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
    return root, tag


def build_festival_hub(
    lod: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    high = lod == "high"
    tag = f"festival_hub_{lod}"
    collection = make_collection(f"RC5_FESTIVAL_HUB_{lod.upper()}")
    root, tag = create_asset_root("festival-hub", lod, collection)
    bevel_segments = 3 if high else 1
    radial_count = 24 if high else 12

    airfield: list[bpy.types.Object] = []
    airfield.append(
        add_cylinder(
            f"AirfieldBase_{tag}",
            (0.0, 0.0, -12.0),
            58.0,
            16.0,
            materials["festival_stone"],
            collection,
            root,
            64 if high else 24,
            0.8,
            bevel_segments,
        )
    )
    for index in range(3):
        airfield.append(
            add_cylinder(
                f"AirfieldTerrace_{index}_{tag}",
                (0.0, 0.0, -3.7 + index * 0.48),
                45.0 - index * 5.5,
                0.72,
                materials["festival_stone"],
                collection,
                root,
                64 if high else 24,
                0.18,
                bevel_segments,
            )
        )
    for index in range(radial_count):
        angle = (index / radial_count) * TAU
        radius = 48.0
        airfield.append(
            add_box(
                f"AirfieldDock_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, -2.4),
                (5.4, 2.2, 0.7),
                materials["festival_stone"],
                collection,
                root,
                rotation=(0.0, 0.0, angle),
                bevel=0.5,
                bevel_segments=bevel_segments,
            )
        )
    join_parts(airfield, "FestivalAirfield", tag, root)

    landing = [
        add_cylinder(
            f"LandingPadBase_{tag}",
            (0.0, 0.0, -3.15),
            20.0,
            0.7,
            materials["gold"],
            collection,
            root,
            64 if high else 24,
            0.14,
            bevel_segments,
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

    tower: list[bpy.types.Object] = []
    for level in range(5 if high else 3):
        height = 4.2 + level * 2.4
        tower.append(
            add_cylinder(
                f"TowerLevel_{level}_{tag}",
                (-18.0, 14.0, 0.2 + height * 0.5 + level * 2.2),
                7.5 - level * 0.65,
                height,
                materials["festival_stone"],
                collection,
                root,
                16 if high else 8,
                0.35,
                bevel_segments,
            )
        )
        tower.append(
            add_cone(
                f"TowerRoof_{level}_{tag}",
                (-18.0, 14.0, 2.5 + height + level * 4.5),
                9.5 - level * 0.65,
                6.5 - level * 0.55,
                2.2,
                materials["gold"],
                collection,
                root,
                16 if high else 8,
            )
        )
    tower.append(
        add_cone(
            f"TowerSpire_{tag}",
            (-18.0, 14.0, 35.0 if high else 24.0),
            1.4,
            0.0,
            9.0,
            materials["gold"],
            collection,
            root,
            12 if high else 6,
        )
    )
    join_parts(tower, "FestivalTower", tag, root)

    flags: list[bpy.types.Object] = []
    flag_count = 18 if high else 8
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
        flag = add_box(
            f"FlagCloth_{index}_{tag}",
            (x + math.cos(angle + math.pi / 2) * 2.4, y + math.sin(angle + math.pi / 2) * 2.4, 7.4 + (index % 3)),
            (2.7, 0.16, 1.35),
            materials["cloth"],
            collection,
            root,
            rotation=(0.0, 0.0, angle + math.pi / 2),
            bevel=0.15,
            bevel_segments=bevel_segments,
        )
        flags.append(flag)
    join_parts(flags, "FestivalFlags", tag, root)

    race_arch: list[bpy.types.Object] = []
    for side in (-1.0, 1.0):
        race_arch.append(
            add_box(
                f"RaceArchPylon_{side}_{tag}",
                (34.0 + side * 8.2, 10.0, 5.0),
                (2.8, 3.4, 9.0),
                materials["festival_stone"],
                collection,
                root,
                rotation=(0.0, 0.0, side * -0.08),
                bevel=0.7,
                bevel_segments=bevel_segments,
            )
        )
        race_arch.append(
            add_cone(
                f"RaceArchCap_{side}_{tag}",
                (34.0 + side * 8.2, 10.0, 14.5),
                4.6,
                2.6,
                3.0,
                materials["gold"],
                collection,
                root,
                12 if high else 6,
            )
        )
    race_arch.append(
        add_box(
            f"RaceArchLintel_{tag}",
            (34.0, 10.0, 14.8),
            (11.5, 3.0, 2.1),
            materials["festival_stone"],
            collection,
            root,
            bevel=0.65,
            bevel_segments=bevel_segments,
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
    join_parts(race_arch, "RaceArch", tag, root)

    accents: list[bpy.types.Object] = []
    lantern_count = 36 if high else 8
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
    collection = make_collection(f"RC5_WIND_CANYON_{lod.upper()}")
    root, tag = create_asset_root("wind-canyon", lod, collection)
    bevel_segments = 3 if high else 1

    cliffs: list[bpy.types.Object] = []
    rock_count = 38 if high else 16
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
        rock = add_ico(
            f"CanyonRock_{index}_{tag}",
            (x, y, z),
            scale,
            materials["canyon_rock"],
            collection,
            root,
            2,
        )
        rock.rotation_euler.z = side * (0.08 + (lane % 4) * 0.035)
        cliffs.append(rock)
    spire_count = 16 if high else 8
    for index in range(spire_count):
        side = -1.0 if index % 2 == 0 else 1.0
        lane = index // 2
        cliffs.append(
            add_cone(
                f"CanyonSpire_{index}_{tag}",
                (side * (58.0 + (lane % 3) * 10.0), -48.0 + lane * 16.0, 9.0 + (lane % 3) * 5.0),
                12.0 + (lane % 3) * 2.5,
                2.0 + (lane % 2),
                52.0 + (lane % 4) * 8.0,
                materials["canyon_rock"],
                collection,
                root,
                18 if high else 8,
                rotation=(side * 0.12, 0.08 * math.sin(lane), 0.0),
            )
        )
    join_parts(cliffs, "CanyonCliffs", tag, root)

    landing_parts = [
        add_ico(
            f"CanyonLandingShelf_{tag}",
            (0.0, -4.0, -14.0),
            (27.0, 24.0, 8.0),
            materials["canyon_rock"],
            collection,
            root,
            2,
        ),
        add_cylinder(
            f"CanyonLandingPad_{tag}",
            (0.0, 0.0, -9.55),
            18.0,
            0.8,
            materials["teal"],
            collection,
            root,
            48 if high else 20,
            0.18,
            bevel_segments,
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
    block_count = 22 if high else 10
    for index in range(block_count):
        theta = (index / (block_count - 1)) * math.pi
        x = math.cos(theta) * 22.0
        z = -8.0 + math.sin(theta) * 22.0
        tunnel.append(
            add_box(
                f"WindTunnelBlock_{index}_{tag}",
                (x, 34.0, z),
                (5.2, 7.0, 3.2),
                materials["canyon_rock"],
                collection,
                root,
                rotation=(0.0, theta - math.pi / 2, 0.0),
                bevel=0.7,
                bevel_segments=bevel_segments,
            )
        )
    for index in range(3):
        ring = add_torus(
            f"WindFlowRing_{index}_{tag}",
            (0.0, -18.0 + index * 28.0, 8.0 + index * 2.0),
            10.0 + index * 1.4,
            0.42,
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
    plank_count = 22 if high else 12
    for index in range(plank_count):
        t = index / (plank_count - 1)
        x = -38.0 + t * 76.0
        if abs(x) < (7.0 if high else 10.0):
            continue
        sag = -2.5 - 3.5 * (1.0 - abs(x) / 38.0)
        bridge.append(
            add_box(
                f"BridgePlank_{index}_{tag}",
                (x, -34.0, sag),
                (2.2, 5.2, 0.48),
                materials["wood"],
                collection,
                root,
                rotation=(0.0, 0.04 * math.sin(index * 1.7), 0.08 * math.sin(index)),
                bevel=0.2,
                bevel_segments=bevel_segments,
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
            add_box(
                f"BridgeAbutment_{side}_{tag}",
                (side * 42.0, -34.0, 0.0),
                (4.5, 8.0, 7.5),
                materials["canyon_rock"],
                collection,
                root,
                bevel=0.8,
                bevel_segments=bevel_segments,
            )
        )
    join_parts(bridge, "BrokenBridge", tag, root)
    return collection, root


def build_cloud_ruins(
    lod: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    high = lod == "high"
    collection = make_collection(f"RC5_CLOUD_RUINS_{lod.upper()}")
    root, tag = create_asset_root("cloud-ruins", lod, collection)
    bevel_segments = 3 if high else 1

    temple: list[bpy.types.Object] = []
    rubble_count = 30 if high else 10
    for index in range(rubble_count):
        angle = (index / rubble_count) * TAU
        radius = 36.0 + (index % 4) * 6.0
        temple.append(
            add_ico(
                f"TempleFoundationRock_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, -11.0 - (index % 3) * 1.8),
                (10.0 + index % 4, 8.0 + index % 3, 7.0 + index % 5),
                materials["ruin_dark"],
                collection,
                root,
                3 if high else 2,
            )
        )
    for level in range(4 if high else 3):
        temple.append(
            add_cylinder(
                f"TempleTerrace_{level}_{tag}",
                (0.0, 0.0, -7.5 + level * 1.4),
                48.0 - level * 6.0,
                2.0,
                materials["ruin_stone"],
                collection,
                root,
                64 if high else 24,
                0.35,
                bevel_segments,
            )
        )
    temple.extend(
        [
            add_box(
                f"TempleHallLeft_{tag}",
                (-11.5, 42.0, 3.0),
                (5.5, 12.0, 8.0),
                materials["ruin_stone"],
                collection,
                root,
                bevel=0.8,
                bevel_segments=bevel_segments,
            ),
            add_box(
                f"TempleHallRight_{tag}",
                (11.5, 42.0, 3.0),
                (5.5, 12.0, 8.0),
                materials["ruin_stone"],
                collection,
                root,
                bevel=0.8,
                bevel_segments=bevel_segments,
            ),
            add_box(
                f"TempleHallLintel_{tag}",
                (0.0, 42.0, 8.5),
                (7.0, 12.0, 2.5),
                materials["ruin_stone"],
                collection,
                root,
                bevel=0.7,
                bevel_segments=bevel_segments,
            ),
            add_box(
                f"TempleDoorShadow_{tag}",
                (0.0, 48.2, 2.0),
                (5.0, 0.5, 6.0),
                materials["ruin_dark"],
                collection,
                root,
                bevel=0.3,
                bevel_segments=bevel_segments,
            ),
            add_cone(
                f"TempleRoof_{tag}",
                (0.0, 42.0, 12.0),
                22.0,
                15.0,
                4.0,
                materials["ruin_dark"],
                collection,
                root,
                12 if high else 6,
            ),
        ]
    )
    join_parts(temple, "CloudTemple", tag, root)

    landing = [
        add_cylinder(
            f"RuinsLandingPad_{tag}",
            (0.0, 0.0, -3.55),
            18.0,
            0.75,
            materials["ruin_gold"],
            collection,
            root,
            56 if high else 24,
            0.16,
            bevel_segments,
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

    pillars: list[bpy.types.Object] = []
    pillar_count = 16 if high else 7
    for index in range(pillar_count):
        angle = (index / pillar_count) * TAU
        radius = 29.0
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius
        height = 10.0 + (index % 4) * 2.8
        pillars.append(
            add_cylinder(
                f"RunePillarShaft_{index}_{tag}",
                (x, y, -2.2 + height * 0.5),
                1.5 + (index % 2) * 0.25,
                height,
                materials["ruin_stone"],
                collection,
                root,
                16 if high else 8,
                0.22,
                bevel_segments,
            )
        )
        pillars.append(
            add_box(
                f"RunePillarCapital_{index}_{tag}",
                (x, y, -1.8 + height),
                (2.5, 2.5, 0.75),
                materials["ruin_stone"],
                collection,
                root,
                rotation=(0.0, 0.0, angle),
                bevel=0.35,
                bevel_segments=bevel_segments,
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
    step_count = 24 if high else 10
    for index in range(step_count):
        t = index / max(1, step_count - 1)
        steps.append(
            add_box(
                f"TempleStep_{index}_{tag}",
                (0.0, 12.0 + t * 24.0, -3.8 + t * 8.0),
                (10.0 - t * 2.0, 1.25, 0.6),
                materials["ruin_stone"],
                collection,
                root,
                bevel=0.28,
                bevel_segments=bevel_segments,
            )
        )
    for side in (-1.0, 1.0):
        steps.append(
            add_box(
                f"TempleStairRail_{side}_{tag}",
                (side * 11.0, 24.0, 2.0),
                (1.0, 14.0, 2.0),
                materials["ruin_stone"],
                collection,
                root,
                rotation=(0.0, side * -0.17, 0.0),
                bevel=0.45,
                bevel_segments=bevel_segments,
            )
        )
    join_parts(steps, "TempleSteps", tag, root)

    slabs: list[bpy.types.Object] = []
    slab_count = 28 if high else 11
    for index in range(slab_count):
        angle = index * 2.3999632297
        radius = 25.0 + (index % 5) * 9.0
        slabs.append(
            add_box(
                f"FloatingSlab_{index}_{tag}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 14.0 + (index % 7) * 3.2),
                (4.5 + index % 3, 3.5 + (index * 2) % 3, 0.75 + (index % 2) * 0.3),
                materials["ruin_stone"],
                collection,
                root,
                rotation=(0.1 * math.sin(index), 0.12 * math.cos(index), angle),
                bevel=0.55,
                bevel_segments=bevel_segments,
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
        "festival_stone": make_material(
            "M_Festival_Stone", (0.27, 0.24, 0.31, 1.0), 0.82
        ),
        "gold": make_material(
            "M_World_Gold", (0.92, 0.58, 0.12, 1.0), 0.42, 0.08, 0.08
        ),
        "cloth": make_material(
            "M_Festival_Cloth", (0.62, 0.08, 0.05, 1.0), 0.78
        ),
        "charcoal": make_material(
            "M_World_Charcoal", (0.06, 0.08, 0.09, 1.0), 0.88
        ),
        "canyon_rock": make_material(
            "M_Canyon_Rock", (0.32, 0.17, 0.11, 1.0), 0.94
        ),
        "wood": make_material(
            "M_Canyon_Wood", (0.20, 0.10, 0.055, 1.0), 0.9
        ),
        "teal": make_material(
            "M_World_Rune", (0.10, 0.68, 0.62, 1.0), 0.38, 0.04, 0.24
        ),
        "ruin_stone": make_material(
            "M_Ruin_Stone", (0.55, 0.62, 0.64, 1.0), 0.86
        ),
        "ruin_dark": make_material(
            "M_Ruin_Dark", (0.25, 0.31, 0.34, 1.0), 0.92
        ),
        "ruin_gold": make_material(
            "M_Ruin_Gold", (0.76, 0.58, 0.24, 1.0), 0.5, 0.06, 0.06
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
