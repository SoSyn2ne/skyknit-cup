"""Build the project-authored Milestone 37 creature and accessory sources.

Run with Blender 4.5 LTS:

    blender --background --python tools/blender/build_character_assets.py -- --asset all

The source files are intentionally procedural and texture-free.  Re-running the
script replaces only the four Milestone 37 source blends; runtime GLBs are made
by ``export_character_asset.py`` so source generation and shipping export stay
independently reproducible.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "source" / "characters"
TAU = math.pi * 2.0

ASSET_IDS = (
    "storm-griffin",
    "cloud-manta",
    "wind-goggles",
    "festival-ribbon",
)

SOURCE_FILENAMES = {
    "storm-griffin": "storm-griffin.blend",
    "cloud-manta": "cloud-manta.blend",
    "wind-goggles": "wind-goggles.blend",
    "festival-ribbon": "festival-ribbon.blend",
}


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", choices=("all", *ASSET_IDS), default="all")
    return parser.parse_args(arguments)


def reset_file() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene.unit_settings.system = "METRIC"


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    *,
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
        vertex_color.layer_name = "CharacterColor"
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


def character_materials(
    body: tuple[float, float, float, float],
    membrane: tuple[float, float, float, float],
    glow: tuple[float, float, float, float],
) -> dict[str, bpy.types.Material]:
    return {
        "base": make_material("M_Dragon_Scale", body, 0.72),
        "membrane": make_material("M_Dragon_Membrane", membrane, 0.5),
        "glow": make_material(
            "M_Dragon_Glow", glow, 0.34, emission_strength=1.15
        ),
    }


def make_empty(
    name: str,
    parent: bpy.types.Object | None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.22
    obj.location = location
    obj.parent = parent
    return obj


def transformed_point(
    point: tuple[float, float, float],
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    rotation: tuple[float, float, float],
) -> tuple[float, float, float]:
    local = Vector(
        (point[0] * radii[0], point[1] * radii[1], point[2] * radii[2])
    )
    rotated = Euler(rotation, "XYZ").to_matrix() @ local
    return (
        rotated.x + center[0],
        rotated.y + center[1],
        rotated.z + center[2],
    )


def append_ellipsoid(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    *,
    segments: int = 24,
    rings: int = 12,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    if segments < 6 or rings < 3:
        raise ValueError("ellipsoid resolution is too low")
    start = len(vertices)
    vertices.append(transformed_point((0.0, 0.0, 1.0), center, radii, rotation))
    for ring in range(1, rings):
        latitude = math.pi * ring / rings
        radius = math.sin(latitude)
        z = math.cos(latitude)
        for segment in range(segments):
            longitude = TAU * segment / segments
            vertices.append(
                transformed_point(
                    (
                        math.cos(longitude) * radius,
                        math.sin(longitude) * radius,
                        z,
                    ),
                    center,
                    radii,
                    rotation,
                )
            )
    bottom = len(vertices)
    vertices.append(transformed_point((0.0, 0.0, -1.0), center, radii, rotation))

    first_ring = start + 1
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        faces.append((start, first_ring + segment, first_ring + next_segment))

    for ring in range(rings - 2):
        current = first_ring + ring * segments
        following = current + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((current + segment, following + segment, following + next_segment))
            faces.append((current + segment, following + next_segment, current + next_segment))

    last_ring = first_ring + (rings - 2) * segments
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        faces.append((last_ring + segment, bottom, last_ring + next_segment))


def append_tube(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    centers: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    *,
    sides: int = 16,
) -> None:
    if len(centers) != len(radii) or len(centers) < 2:
        raise ValueError("tube path contract is invalid")
    start = len(vertices)
    for center, (radius_x, radius_z) in zip(centers, radii):
        for side in range(sides):
            angle = TAU * side / sides
            vertices.append(
                (
                    center[0] + math.cos(angle) * radius_x,
                    center[1],
                    center[2] + math.sin(angle) * radius_z,
                )
            )
    for ring in range(len(centers) - 1):
        current = start + ring * sides
        following = current + sides
        for side in range(sides):
            following_side = (side + 1) % sides
            faces.append((current + side, following + side, following + following_side))
            faces.append((current + side, following + following_side, current + following_side))
    first_center = len(vertices)
    vertices.append(centers[0])
    last_center = len(vertices)
    vertices.append(centers[-1])
    last_ring = start + (len(centers) - 1) * sides
    for side in range(sides):
        following_side = (side + 1) % sides
        faces.append((first_center, start + following_side, start + side))
        faces.append((last_center, last_ring + side, last_ring + following_side))


def append_wedge(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    center: tuple[float, float, float],
    size: tuple[float, float, float],
) -> None:
    cx, cy, cz = center
    width, length, height = size
    start = len(vertices)
    vertices.extend(
        (
            (cx - width, cy, cz + height),
            (cx + width, cy, cz + height),
            (cx - width * 0.78, cy, cz - height),
            (cx + width * 0.78, cy, cz - height),
            (cx - width * 0.16, cy + length, cz + height * 0.18),
            (cx + width * 0.16, cy + length, cz + height * 0.18),
            (cx - width * 0.1, cy + length, cz - height * 0.24),
            (cx + width * 0.1, cy + length, cz - height * 0.24),
        )
    )
    faces.extend(
        tuple(start + index for index in face)
        for face in (
            (0, 2, 1), (1, 2, 3),
            (4, 5, 6), (5, 7, 6),
            (0, 1, 4), (1, 5, 4),
            (2, 6, 3), (3, 6, 7),
            (0, 4, 2), (2, 4, 6),
            (1, 3, 5), (3, 7, 5),
        )
    )


def append_wing_surface(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    *,
    side: int,
    style: str,
    span_steps: int,
    chord_steps: int,
) -> None:
    if side not in (-1, 1):
        raise ValueError("wing side must be -1 or 1")
    start = len(vertices)
    thickness = 0.032 if style == "griffin" else 0.045

    def point(span_index: int, chord_index: int, layer: int) -> tuple[float, float, float]:
        span = span_index / span_steps
        chord = chord_index / chord_steps
        if style == "griffin":
            reach = 4.55 * span
            leading = 0.58 - 0.34 * span + 0.12 * math.sin(math.pi * span)
            trailing = -1.08 + 0.72 * span
            feather_notch = 0.16 * math.sin(span * math.pi * 7.0) ** 2
            y = leading * (1.0 - chord) + (trailing - feather_notch) * chord
            z = 0.34 * math.sin(math.pi * span) - 0.14 * chord * span
        else:
            reach = 5.55 * span
            leading = 1.46 - 0.78 * span + 0.18 * math.sin(math.pi * span)
            trailing = -1.78 + 1.10 * span - 0.12 * math.sin(math.pi * span)
            y = leading * (1.0 - chord) + trailing * chord
            z = 0.18 * math.sin(math.pi * span) - 0.06 * chord
        return (side * reach, y, z + (thickness if layer == 0 else -thickness))

    row_size = chord_steps + 1
    layer_size = (span_steps + 1) * row_size
    for layer in range(2):
        for span_index in range(span_steps + 1):
            for chord_index in range(chord_steps + 1):
                vertices.append(point(span_index, chord_index, layer))

    for span_index in range(span_steps):
        for chord_index in range(chord_steps):
            top = start + span_index * row_size + chord_index
            top_next = top + row_size
            faces.append((top, top_next, top_next + 1))
            faces.append((top, top_next + 1, top + 1))
            bottom = top + layer_size
            bottom_next = bottom + row_size
            faces.append((bottom, bottom_next + 1, bottom_next))
            faces.append((bottom, bottom + 1, bottom_next + 1))

    perimeter: list[tuple[int, int]] = []
    for span_index in range(span_steps):
        perimeter.append((span_index * row_size, (span_index + 1) * row_size))
        perimeter.append(
            (
                span_index * row_size + chord_steps,
                (span_index + 1) * row_size + chord_steps,
            )
        )
    for chord_index in range(chord_steps):
        perimeter.append((chord_index, chord_index + 1))
        last_row = span_steps * row_size
        perimeter.append((last_row + chord_index, last_row + chord_index + 1))
    for first, second in perimeter:
        top_first = start + first
        top_second = start + second
        bottom_first = top_first + layer_size
        bottom_second = top_second + layer_size
        faces.append((top_first, bottom_first, bottom_second))
        faces.append((top_first, bottom_second, top_second))


def append_torus(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    center: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    *,
    major_segments: int = 32,
    minor_segments: int = 10,
    rotation: tuple[float, float, float] = (math.pi / 2.0, 0.0, 0.0),
) -> None:
    start = len(vertices)
    matrix = Euler(rotation, "XYZ").to_matrix()
    center_vector = Vector(center)
    for major in range(major_segments):
        major_angle = TAU * major / major_segments
        for minor in range(minor_segments):
            minor_angle = TAU * minor / minor_segments
            radius = major_radius + minor_radius * math.cos(minor_angle)
            local = Vector(
                (
                    radius * math.cos(major_angle),
                    radius * math.sin(major_angle),
                    minor_radius * math.sin(minor_angle),
                )
            )
            point = matrix @ local + center_vector
            vertices.append(tuple(point))
    for major in range(major_segments):
        next_major = (major + 1) % major_segments
        for minor in range(minor_segments):
            next_minor = (minor + 1) % minor_segments
            a = start + major * minor_segments + minor
            b = start + next_major * minor_segments + minor
            c = start + next_major * minor_segments + next_minor
            d = start + major * minor_segments + next_minor
            faces.append((a, b, c))
            faces.append((a, c, d))


def apply_vertex_colors(
    mesh: bpy.types.Mesh,
    base_color: tuple[float, float, float, float],
) -> None:
    attribute = mesh.color_attributes.new(
        name="CharacterColor", type="BYTE_COLOR", domain="POINT"
    )
    if mesh.vertices:
        z_values = [vertex.co.z for vertex in mesh.vertices]
        z_low = min(z_values)
        z_span = max(max(z_values) - z_low, 1e-6)
    else:
        z_low = 0.0
        z_span = 1.0
    for index, item in enumerate(attribute.data):
        vertex = mesh.vertices[index]
        height = (vertex.co.z - z_low) / z_span
        facet = 0.5 + 0.5 * math.sin(
            vertex.co.x * 2.17 + vertex.co.y * 1.31 + vertex.co.z * 2.83 + index * 0.73
        )
        shade = 0.72 + height * 0.18 + facet * 0.12
        item.color = (
            min(1.0, base_color[0] * shade),
            min(1.0, base_color[1] * shade),
            min(1.0, base_color[2] * (shade + 0.04)),
            base_color[3],
        )
    mesh.color_attributes.active_color = attribute


def make_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    smooth: bool = True,
) -> bpy.types.Object:
    if not vertices or not faces:
        raise ValueError(f"{name} has no geometry")
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)
    mesh.materials.append(material)
    apply_vertex_colors(mesh, tuple(material["vertex_color"]))
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def add_ellipsoid_part(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    *,
    segments: int,
    rings: int,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    append_ellipsoid(
        vertices,
        faces,
        center,
        radii,
        segments=segments,
        rings=rings,
        rotation=rotation,
    )


def create_character_rig(
    asset_id: str,
    *,
    head_location: tuple[float, float, float],
    wing_locations: tuple[tuple[float, float, float], tuple[float, float, float]],
    tail_start: tuple[float, float, float],
    tail_step: tuple[float, float, float],
) -> dict[str, bpy.types.Object]:
    root = make_empty("DragonRoot", None)
    root["asset_id"] = asset_id
    root["asset_version"] = "1.0"
    root["asset_license"] = "project-authored"
    root["runtime_rig"] = "wing-head-tail-expression-pivots-v3"
    root["material_contract"] = "scale-membrane-glow-v1"
    root["socket_contract"] = "head-back-tail-v1"
    left = make_empty("WingRig_L", root, wing_locations[0])
    right = make_empty("WingRig_R", root, wing_locations[1])
    head = make_empty("HeadRig", root, head_location)
    jaw = make_empty("JawRig", head, (0.0, 0.46, -0.12))
    eye_left = make_empty("EyeRig_L", head, (-0.31, 0.42, 0.20))
    eye_right = make_empty("EyeRig_R", head, (0.31, 0.42, 0.20))
    head_socket = make_empty("AccessorySocket_Head", head, (0.0, 0.46, 0.34))
    back_socket = make_empty("AccessorySocket_Back", root, (0.0, -0.18, 3.34))

    tails: list[bpy.types.Object] = []
    tail_parent = root
    for index in range(1, 6):
        location = tail_start if index == 1 else tail_step
        tail = make_empty(f"TailRig_{index}", tail_parent, location)
        tails.append(tail)
        tail_parent = tail
    tail_socket = make_empty("AccessorySocket_Tail", tails[-1], tail_step)
    return {
        "root": root,
        "left": left,
        "right": right,
        "head": head,
        "jaw": jaw,
        "eye_left": eye_left,
        "eye_right": eye_right,
        "head_socket": head_socket,
        "back_socket": back_socket,
        "tail_socket": tail_socket,
        **{f"tail_{index + 1}": tail for index, tail in enumerate(tails)},
    }


def character_triangle_count(root: bpy.types.Object) -> int:
    triangles = 0
    for obj in (root, *root.children_recursive):
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return triangles


def finish_character(
    rig: dict[str, bpy.types.Object],
    *,
    silhouette_features: str,
) -> None:
    root = rig["root"]
    triangles = character_triangle_count(root)
    if not 18_000 <= triangles <= 20_500:
        raise RuntimeError(
            f"{root['asset_id']} triangles are outside the runtime budget: {triangles}"
        )
    root["silhouette_features"] = silhouette_features
    root["triangle_target"] = triangles
    root["render_mesh_target"] = sum(
        1 for obj in (root, *root.children_recursive) if obj.type == "MESH"
    )


def build_griffin() -> bpy.types.Object:
    materials = character_materials(
        (0.20, 0.25, 0.34, 1.0),
        (0.44, 0.58, 0.68, 1.0),
        (0.20, 0.86, 0.93, 1.0),
    )
    rig = create_character_rig(
        "storm-griffin",
        head_location=(0.0, 1.62, 3.20),
        wing_locations=((-0.58, 0.18, 3.08), (0.58, 0.18, 3.08)),
        tail_start=(0.0, -1.48, 2.54),
        tail_step=(0.0, -0.92, -0.035),
    )
    body_vertices: list[tuple[float, float, float]] = []
    body_faces: list[tuple[int, int, int]] = []
    body_parts = (
        ((0.0, -0.28, 2.58), (0.76, 1.45, 0.65), 32, 16, (0.0, 0.0, 0.0)),
        ((0.0, 0.65, 2.86), (0.86, 0.84, 0.82), 32, 16, (0.0, 0.0, 0.0)),
        ((-0.48, -0.82, 2.22), (0.48, 0.68, 0.58), 24, 12, (0.0, 0.0, -0.08)),
        ((0.48, -0.82, 2.22), (0.48, 0.68, 0.58), 24, 12, (0.0, 0.0, 0.08)),
        ((-0.56, 0.52, 2.66), (0.42, 0.62, 0.48), 20, 10, (0.0, 0.0, -0.12)),
        ((0.56, 0.52, 2.66), (0.42, 0.62, 0.48), 20, 10, (0.0, 0.0, 0.12)),
    )
    for center, radii, segments, rings, rotation in body_parts:
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            center,
            radii,
            segments=segments,
            rings=rings,
            rotation=rotation,
        )
    for side in (-1, 1):
        for center, radii, rotation in (
            ((side * 0.54, 0.44, 1.96), (0.22, 0.32, 0.54), (0.18, 0.0, -side * 0.16)),
            ((side * 0.58, 0.49, 1.45), (0.18, 0.28, 0.43), (-0.22, 0.0, side * 0.08)),
            ((side * 0.58, 0.67, 1.10), (0.30, 0.42, 0.15), (0.0, 0.0, side * 0.08)),
            ((side * 0.53, -0.77, 1.73), (0.28, 0.42, 0.52), (-0.18, 0.0, side * 0.12)),
            ((side * 0.51, -0.58, 1.26), (0.22, 0.36, 0.40), (0.22, 0.0, -side * 0.08)),
            ((side * 0.50, -0.38, 0.96), (0.34, 0.48, 0.14), (0.0, 0.0, -side * 0.06)),
        ):
            add_ellipsoid_part(
                body_vertices,
                body_faces,
                center,
                radii,
                segments=18,
                rings=9,
                rotation=rotation,
            )
    for feather_index in range(10):
        column = -1 if feather_index % 2 == 0 else 1
        row = feather_index // 2
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            (column * (0.18 + row * 0.035), 0.91 - row * 0.31, 3.39 - row * 0.08),
            (0.19, 0.38, 0.075),
            segments=16,
            rings=8,
            rotation=(0.10, column * 0.11, column * 0.05),
        )
    make_mesh("Griffin_Body", body_vertices, body_faces, materials["base"], rig["root"])

    for side, parent, name in (
        (-1, rig["left"], "Griffin_Wing_L"),
        (1, rig["right"], "Griffin_Wing_R"),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        append_wing_surface(
            vertices,
            faces,
            side=side,
            style="griffin",
            span_steps=42,
            chord_steps=13,
        )
        make_mesh(name, vertices, faces, materials["membrane"], parent)

    head_vertices: list[tuple[float, float, float]] = []
    head_faces: list[tuple[int, int, int]] = []
    add_ellipsoid_part(
        head_vertices, head_faces, (0.0, 0.12, 0.02), (0.62, 0.72, 0.56), segments=30, rings=15
    )
    append_wedge(head_vertices, head_faces, (0.0, 0.30, -0.08), (0.47, 1.02, 0.27))
    for side in (-1, 1):
        for index in range(3):
            add_ellipsoid_part(
                head_vertices,
                head_faces,
                (side * (0.24 + index * 0.12), -0.17 - index * 0.05, 0.39 + index * 0.12),
                (0.13, 0.30, 0.08),
                segments=14,
                rings=7,
                rotation=(0.0, side * 0.18, side * 0.36),
            )
    make_mesh("Griffin_Head", head_vertices, head_faces, materials["base"], rig["head"])

    jaw_vertices: list[tuple[float, float, float]] = []
    jaw_faces: list[tuple[int, int, int]] = []
    add_ellipsoid_part(
        jaw_vertices, jaw_faces, (0.0, 0.32, -0.08), (0.36, 0.58, 0.16), segments=24, rings=10
    )
    make_mesh("Griffin_Jaw", jaw_vertices, jaw_faces, materials["base"], rig["jaw"])

    for side_name, parent, side in (
        ("L", rig["eye_left"], -1), ("R", rig["eye_right"], 1)
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        add_ellipsoid_part(
            vertices, faces, (0.0, 0.0, 0.0), (0.14, 0.08, 0.11), segments=14, rings=7
        )
        make_mesh(f"Griffin_Eye_{side_name}", vertices, faces, materials["glow"], parent)

    for index in range(1, 6):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        radius = 0.30 - index * 0.038
        append_tube(
            vertices,
            faces,
            [(0.0, 0.08, 0.0), (0.0, -0.28, 0.025), (0.0, -0.62, -0.01), (0.0, -0.92, 0.0)],
            [(radius, radius * 0.82), (radius * 0.91, radius * 0.76), (radius * 0.75, radius * 0.65), (radius * 0.60, radius * 0.55)],
            sides=16,
        )
        if index == 5:
            for fan_side in (-1, 1):
                for feather in range(3):
                    add_ellipsoid_part(
                        vertices,
                        faces,
                        (fan_side * (0.14 + feather * 0.11), -0.88 - feather * 0.10, feather * 0.04),
                        (0.10, 0.38, 0.035),
                        segments=12,
                        rings=6,
                        rotation=(0.0, fan_side * 0.18, fan_side * 0.22),
                    )
        make_mesh(f"Griffin_Tail_{index}", vertices, faces, materials["base"], rig[f"tail_{index}"])

    finish_character(
        rig,
        silhouette_features="hooked-beak layered-flight-feathers lion-haunches fan-tail",
    )
    return rig["root"]


def build_manta() -> bpy.types.Object:
    materials = character_materials(
        (0.34, 0.44, 0.52, 1.0),
        (0.64, 0.74, 0.78, 1.0),
        (0.34, 0.94, 0.86, 1.0),
    )
    rig = create_character_rig(
        "cloud-manta",
        head_location=(0.0, 1.56, 2.66),
        wing_locations=((-0.48, 0.0, 2.62), (0.48, 0.0, 2.62)),
        tail_start=(0.0, -1.58, 2.54),
        tail_step=(0.0, -1.13, -0.028),
    )
    rig["back_socket"].location = (0.0, -0.10, 3.02)
    rig["head_socket"].location = (0.0, 0.36, 0.22)

    body_vertices: list[tuple[float, float, float]] = []
    body_faces: list[tuple[int, int, int]] = []
    for center, radii, segments, rings in (
        ((0.0, -0.06, 2.62), (1.22, 1.80, 0.31), 42, 15),
        ((0.0, 0.88, 2.66), (0.94, 0.92, 0.35), 32, 14),
        ((0.0, 0.54, 2.91), (0.46, 0.68, 0.21), 24, 12),
        ((0.0, -0.42, 2.42), (0.72, 1.18, 0.22), 24, 12),
    ):
        add_ellipsoid_part(
            body_vertices, body_faces, center, radii, segments=segments, rings=rings
        )
    for side in (-1, 1):
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            (side * 0.70, -1.18, 2.48),
            (0.48, 0.70, 0.12),
            segments=20,
            rings=10,
            rotation=(0.0, side * 0.08, side * 0.22),
        )
    make_mesh("Manta_Body", body_vertices, body_faces, materials["base"], rig["root"])

    for side, parent, name in (
        (-1, rig["left"], "Manta_Fin_L"),
        (1, rig["right"], "Manta_Fin_R"),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        append_wing_surface(
            vertices,
            faces,
            side=side,
            style="manta",
            span_steps=59,
            chord_steps=22,
        )
        make_mesh(name, vertices, faces, materials["membrane"], parent)

    head_vertices: list[tuple[float, float, float]] = []
    head_faces: list[tuple[int, int, int]] = []
    add_ellipsoid_part(
        head_vertices, head_faces, (0.0, 0.10, 0.0), (0.78, 0.84, 0.30), segments=32, rings=14
    )
    for side in (-1, 1):
        add_ellipsoid_part(
            head_vertices,
            head_faces,
            (side * 0.46, 0.66, -0.02),
            (0.19, 0.62, 0.10),
            segments=20,
            rings=10,
            rotation=(0.0, side * 0.10, side * 0.10),
        )
    make_mesh("Manta_Head", head_vertices, head_faces, materials["base"], rig["head"])

    jaw_vertices: list[tuple[float, float, float]] = []
    jaw_faces: list[tuple[int, int, int]] = []
    add_ellipsoid_part(
        jaw_vertices, jaw_faces, (0.0, 0.34, -0.16), (0.47, 0.42, 0.09), segments=24, rings=10
    )
    make_mesh("Manta_Jaw", jaw_vertices, jaw_faces, materials["base"], rig["jaw"])

    for side_name, parent in (("L", rig["eye_left"]), ("R", rig["eye_right"])):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        add_ellipsoid_part(
            vertices, faces, (0.0, 0.0, 0.0), (0.13, 0.075, 0.10), segments=14, rings=7
        )
        make_mesh(f"Manta_Eye_{side_name}", vertices, faces, materials["glow"], parent)

    for index in range(1, 6):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        radius = 0.18 - index * 0.024
        append_tube(
            vertices,
            faces,
            [(0.0, 0.06, 0.0), (0.0, -0.36, 0.015), (0.0, -0.76, -0.015), (0.0, -1.13, 0.0)],
            [(radius, radius * 0.72), (radius * 0.82, radius * 0.64), (radius * 0.62, radius * 0.52), (radius * 0.42, radius * 0.38)],
            sides=16,
        )
        if index == 5:
            for side in (-1, 1):
                add_ellipsoid_part(
                    vertices,
                    faces,
                    (side * 0.13, -1.02, 0.0),
                    (0.16, 0.46, 0.025),
                    segments=14,
                    rings=7,
                    rotation=(0.0, side * 0.14, side * 0.16),
                )
        make_mesh(f"Manta_Tail_{index}", vertices, faces, materials["base"], rig[f"tail_{index}"])

    finish_character(
        rig,
        silhouette_features="flat-disc broad-pectoral-fins cephalic-lobes whip-tail",
    )
    return rig["root"]


def create_accessory_root(asset_id: str, object_name: str) -> bpy.types.Object:
    root = make_empty(object_name, None)
    root["asset_id"] = asset_id
    root["asset_version"] = "1.0"
    root["asset_license"] = "project-authored"
    root["accessory_origin"] = "socket-local"
    return root


def build_goggles() -> bpy.types.Object:
    frame = make_material("M_Accessory_Frame", (0.08, 0.12, 0.15, 1.0), 0.36, metallic=0.62)
    lens = make_material("M_Accessory_Lens", (0.24, 0.88, 0.90, 0.82), 0.18, metallic=0.12)
    root = create_accessory_root("wind-goggles", "M37_WindGogglesAsset")

    frame_vertices: list[tuple[float, float, float]] = []
    frame_faces: list[tuple[int, int, int]] = []
    for side in (-1, 1):
        append_torus(
            frame_vertices,
            frame_faces,
            (side * 0.30, 0.0, 0.0),
            0.25,
            0.035,
            major_segments=32,
            minor_segments=10,
        )
    append_tube(
        frame_vertices,
        frame_faces,
        [(-0.08, -0.01, 0.0), (0.0, 0.035, 0.0), (0.08, -0.01, 0.0)],
        [(0.035, 0.035), (0.032, 0.032), (0.035, 0.035)],
        sides=10,
    )
    for side in (-1, 1):
        append_tube(
            frame_vertices,
            frame_faces,
            [(side * 0.53, 0.0, 0.0), (side * 0.66, -0.10, 0.0), (side * 0.72, -0.27, -0.02)],
            [(0.030, 0.030), (0.026, 0.026), (0.020, 0.020)],
            sides=10,
        )
    make_mesh("WindGoggles_Frame", frame_vertices, frame_faces, frame, root)

    lens_vertices: list[tuple[float, float, float]] = []
    lens_faces: list[tuple[int, int, int]] = []
    for side in (-1, 1):
        add_ellipsoid_part(
            lens_vertices,
            lens_faces,
            (side * 0.30, 0.012, 0.0),
            (0.215, 0.028, 0.205),
            segments=24,
            rings=8,
        )
    make_mesh("WindGoggles_Lenses", lens_vertices, lens_faces, lens, root)
    root["attachment_socket"] = "AccessorySocket_Head"
    return root


def append_ribbon_strip(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    *,
    side: int,
    length_steps: int = 24,
    width_steps: int = 6,
) -> None:
    start = len(vertices)
    row_size = width_steps + 1
    for layer in range(2):
        z_offset = 0.012 if layer == 0 else -0.012
        for length_index in range(length_steps + 1):
            progress = length_index / length_steps
            center_x = side * (0.13 + 0.18 * progress) + math.sin(progress * math.pi * 2.4) * 0.08
            center_y = -0.10 - progress * 1.34
            center_z = -0.05 - progress * 0.16 + math.sin(progress * math.pi * 2.0) * 0.08
            half_width = 0.16 * (1.0 - progress * 0.35)
            for width_index in range(width_steps + 1):
                across = width_index / width_steps * 2.0 - 1.0
                vertices.append((center_x + across * half_width, center_y, center_z + z_offset))
    layer_size = (length_steps + 1) * row_size
    for length_index in range(length_steps):
        for width_index in range(width_steps):
            top = start + length_index * row_size + width_index
            next_top = top + row_size
            faces.extend(((top, next_top, next_top + 1), (top, next_top + 1, top + 1)))
            bottom = top + layer_size
            next_bottom = bottom + row_size
            faces.extend(((bottom, next_bottom + 1, next_bottom), (bottom, bottom + 1, next_bottom + 1)))
    for edge in (0, width_steps):
        for length_index in range(length_steps):
            top = start + length_index * row_size + edge
            next_top = top + row_size
            bottom = top + layer_size
            next_bottom = next_top + layer_size
            faces.extend(((top, bottom, next_bottom), (top, next_bottom, next_top)))


def build_ribbon() -> bpy.types.Object:
    knot_material = make_material("M_Accessory_Knot", (0.91, 0.26, 0.23, 1.0), 0.52)
    ribbon_material = make_material("M_Accessory_Ribbon", (0.96, 0.68, 0.18, 1.0), 0.48)
    root = create_accessory_root("festival-ribbon", "M37_FestivalRibbonAsset")

    knot_vertices: list[tuple[float, float, float]] = []
    knot_faces: list[tuple[int, int, int]] = []
    add_ellipsoid_part(
        knot_vertices,
        knot_faces,
        (0.0, 0.0, 0.0),
        (0.22, 0.16, 0.19),
        segments=24,
        rings=10,
    )
    for side in (-1, 1):
        add_ellipsoid_part(
            knot_vertices,
            knot_faces,
            (side * 0.24, -0.01, 0.01),
            (0.25, 0.10, 0.17),
            segments=18,
            rings=8,
            rotation=(0.0, side * 0.14, side * 0.20),
        )
    make_mesh("FestivalRibbon_Knot", knot_vertices, knot_faces, knot_material, root)

    ribbon_vertices: list[tuple[float, float, float]] = []
    ribbon_faces: list[tuple[int, int, int]] = []
    append_ribbon_strip(ribbon_vertices, ribbon_faces, side=-1)
    append_ribbon_strip(ribbon_vertices, ribbon_faces, side=1)
    make_mesh("FestivalRibbon_Tails", ribbon_vertices, ribbon_faces, ribbon_material, root)
    root["attachment_socket"] = "AccessorySocket_Tail"
    return root


BUILDERS = {
    "storm-griffin": build_griffin,
    "cloud-manta": build_manta,
    "wind-goggles": build_goggles,
    "festival-ribbon": build_ribbon,
}


def save_asset(asset_id: str) -> None:
    reset_file()
    root = BUILDERS[asset_id]()
    root["generator"] = "tools/blender/build_character_assets.py"
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    output = SOURCE_DIR / SOURCE_FILENAMES[asset_id]
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    mesh_count = sum(
        1 for obj in (root, *root.children_recursive) if obj.type == "MESH"
    )
    triangle_count = character_triangle_count(root)
    print(
        "CHARACTER_SOURCE="
        f"asset={asset_id};file={output};meshes={mesh_count};triangles={triangle_count}"
    )


def main() -> None:
    selected = parse_args().asset
    assets = ASSET_IDS if selected == "all" else (selected,)
    for asset_id in assets:
        save_asset(asset_id)


if __name__ == "__main__":
    main()
