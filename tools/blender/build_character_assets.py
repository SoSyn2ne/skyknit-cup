"""Build the project-authored Milestone 37/38 creature and accessory sources.

Run with Blender 4.5 LTS:

    blender --background --python tools/blender/build_character_assets.py -- --asset all

The source files are intentionally procedural and texture-free.  Re-running the
script replaces only the selected project-authored source blends; runtime GLBs are made
by ``export_character_asset.py`` so source generation and shipping export stay
independently reproducible.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Callable

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "source" / "characters"
TAU = math.pi * 2.0

ASSET_IDS = (
    "ember-phoenix",
    "storm-white-tiger",
    "storm-griffin",
    "cloud-manta",
    "wind-goggles",
    "festival-ribbon",
)

SOURCE_FILENAMES = {
    "ember-phoenix": "ember-phoenix.blend",
    "storm-white-tiger": "storm-white-tiger.blend",
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


def append_oriented_loft(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    centers: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    *,
    sides: int = 20,
    rolls: list[float] | None = None,
    cap_start: bool = True,
    cap_end: bool = True,
) -> None:
    """Append a continuous elliptical loft along an arbitrary 3D path."""

    if len(centers) != len(radii) or len(centers) < 2:
        raise ValueError("oriented loft path contract is invalid")
    if rolls is None:
        rolls = [0.0] * len(centers)
    if len(rolls) != len(centers):
        raise ValueError("oriented loft roll contract is invalid")

    path = [Vector(center) for center in centers]
    start = len(vertices)
    for index, (center, (radius_a, radius_b), roll) in enumerate(
        zip(path, radii, rolls)
    ):
        if index == 0:
            tangent = path[1] - center
        elif index == len(path) - 1:
            tangent = center - path[index - 1]
        else:
            tangent = path[index + 1] - path[index - 1]
        tangent.normalize()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.94:
            reference = Vector((0.0, 1.0, 0.0))
        axis_a = tangent.cross(reference).normalized()
        axis_b = axis_a.cross(tangent).normalized()
        if roll != 0.0:
            cosine = math.cos(roll)
            sine = math.sin(roll)
            rolled_a = axis_a * cosine + axis_b * sine
            rolled_b = -axis_a * sine + axis_b * cosine
            axis_a, axis_b = rolled_a, rolled_b
        for side in range(sides):
            angle = TAU * side / sides
            point = (
                center
                + axis_a * (math.cos(angle) * radius_a)
                + axis_b * (math.sin(angle) * radius_b)
            )
            vertices.append(tuple(point))

    for ring in range(len(path) - 1):
        current = start + ring * sides
        following = current + sides
        for side in range(sides):
            following_side = (side + 1) % sides
            faces.append((current + side, following + side, following + following_side))
            faces.append((current + side, following + following_side, current + following_side))

    if cap_start:
        first_center = len(vertices)
        vertices.append(tuple(path[0]))
        for side in range(sides):
            following_side = (side + 1) % sides
            faces.append((first_center, start + following_side, start + side))
    if cap_end:
        last_center = len(vertices)
        vertices.append(tuple(path[-1]))
        last_ring = start + (len(path) - 1) * sides
        for side in range(sides):
            following_side = (side + 1) % sides
            faces.append((last_center, last_ring + side, last_ring + following_side))


def subdivide_loft_profile(
    centers: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    *,
    subdivisions: int = 2,
) -> tuple[list[tuple[float, float, float]], list[tuple[float, float]]]:
    if len(centers) != len(radii) or len(centers) < 2 or subdivisions < 1:
        raise ValueError("loft subdivision contract is invalid")
    dense_centers: list[tuple[float, float, float]] = []
    dense_radii: list[tuple[float, float]] = []
    for index in range(len(centers) - 1):
        start_center = Vector(centers[index])
        end_center = Vector(centers[index + 1])
        start_radius = radii[index]
        end_radius = radii[index + 1]
        for step in range(subdivisions):
            progress = step / subdivisions
            dense_centers.append(tuple(start_center.lerp(end_center, progress)))
            dense_radii.append(
                (
                    start_radius[0] + (end_radius[0] - start_radius[0]) * progress,
                    start_radius[1] + (end_radius[1] - start_radius[1]) * progress,
                )
            )
    dense_centers.append(centers[-1])
    dense_radii.append(radii[-1])
    return dense_centers, dense_radii


def append_feather_leaf(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    root: tuple[float, float, float],
    tip: tuple[float, float, float],
    half_width: float,
    *,
    thickness: float = 0.028,
    camber: float = 0.08,
    bend: tuple[float, float, float] = (0.0, 0.0, 0.0),
    surface_normal: tuple[float, float, float] = (0.0, 0.0, 1.0),
    length_steps: int = 7,
    width_steps: int = 4,
    colors: list[tuple[float, float, float, float]] | None = None,
    root_color: tuple[float, float, float, float] = (0.82, 0.54, 0.34, 1.0),
    tip_color: tuple[float, float, float, float] = (1.0, 0.86, 0.42, 1.0),
) -> None:
    """Append one tapered, cambered solid feather with a pointed silhouette."""

    root_vector = Vector(root)
    tip_vector = Vector(tip)
    direction = tip_vector - root_vector
    if direction.length <= 1e-5:
        raise ValueError("feather has no length")
    direction.normalize()
    reference = Vector(surface_normal)
    if reference.length <= 1e-5:
        raise ValueError("feather surface normal has no length")
    reference.normalize()
    if abs(direction.dot(reference)) > 0.94:
        reference = Vector((0.0, 1.0, 0.0))
        if abs(direction.dot(reference)) > 0.94:
            reference = Vector((1.0, 0.0, 0.0))
    width_axis = direction.cross(reference).normalized()
    surface_axis = width_axis.cross(direction).normalized()
    bend_vector = Vector(bend)
    start = len(vertices)
    row_size = width_steps + 1
    layer_size = (length_steps + 1) * row_size

    for layer in range(2):
        layer_sign = 1.0 if layer == 0 else -1.0
        for length_index in range(length_steps + 1):
            progress = length_index / length_steps
            center = root_vector.lerp(tip_vector, progress)
            center += bend_vector * math.sin(math.pi * progress)
            center += surface_axis * camber * math.sin(math.pi * progress)
            taper = 0.025 + 0.975 * math.sin(math.pi * progress) ** 0.66
            station_width = half_width * taper
            for width_index in range(width_steps + 1):
                across = width_index / width_steps * 2.0 - 1.0
                edge_camber = 1.0 - across * across
                point = (
                    center
                    + width_axis * (station_width * across)
                    + surface_axis
                    * (layer_sign * thickness + camber * 0.18 * edge_camber)
                )
                vertices.append(tuple(point))
                if colors is not None:
                    color = tuple(
                        root_channel
                        + (tip_channel - root_channel) * progress
                        for root_channel, tip_channel in zip(root_color, tip_color)
                    )
                    # A darker vane edge and underside keep overlapping rows
                    # readable without extra seams, materials or geometry.
                    edge_shade = (0.68 + 0.32 * edge_camber) * (
                        1.0 if layer == 0 else 0.78
                    )
                    colors.append(
                        (
                            color[0] * edge_shade,
                            color[1] * edge_shade,
                            color[2] * edge_shade,
                            color[3],
                        )
                    )

    for length_index in range(length_steps):
        for width_index in range(width_steps):
            top = start + length_index * row_size + width_index
            next_top = top + row_size
            faces.extend(
                ((top, next_top, next_top + 1), (top, next_top + 1, top + 1))
            )
            bottom = top + layer_size
            next_bottom = bottom + row_size
            faces.extend(
                (
                    (bottom, next_bottom + 1, next_bottom),
                    (bottom, bottom + 1, next_bottom + 1),
                )
            )

    for edge in (0, width_steps):
        for length_index in range(length_steps):
            top = start + length_index * row_size + edge
            next_top = top + row_size
            bottom = top + layer_size
            next_bottom = next_top + layer_size
            faces.extend(((top, bottom, next_bottom), (top, next_bottom, next_top)))
    for length_index in (0, length_steps):
        base = start + length_index * row_size
        for width_index in range(width_steps):
            top = base + width_index
            next_top = top + 1
            bottom = top + layer_size
            next_bottom = next_top + layer_size
            faces.extend(((top, next_bottom, bottom), (top, next_top, next_bottom)))


def append_tapered_claw(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    start: tuple[float, float, float],
    middle: tuple[float, float, float],
    tip: tuple[float, float, float],
    radius: float,
    *,
    sides: int = 10,
) -> None:
    append_oriented_loft(
        vertices,
        faces,
        [start, middle, tip],
        [(radius, radius * 0.86), (radius * 0.58, radius * 0.48), (0.018, 0.012)],
        sides=sides,
    )


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
        name="CharacterColor", type="FLOAT_COLOR", domain="POINT"
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


def apply_authored_vertex_colors(
    mesh: bpy.types.Mesh,
    colors: list[tuple[float, float, float, float]],
) -> None:
    if len(colors) != len(mesh.vertices):
        raise ValueError(
            f"authored vertex color count mismatch: {len(colors)} != {len(mesh.vertices)}"
        )
    attribute = mesh.color_attributes.new(
        name="CharacterColor", type="BYTE_COLOR", domain="POINT"
    )
    for item, color in zip(attribute.data, colors):
        item.color = color
    mesh.color_attributes.active_color = attribute


def make_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    smooth: bool = True,
    vertex_colors: list[tuple[float, float, float, float]] | None = None,
    vertex_color_fn: Callable[
        [Vector, int], tuple[float, float, float, float]
    ]
    | None = None,
) -> bpy.types.Object:
    if not vertices or not faces:
        raise ValueError(f"{name} has no geometry")
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)
    mesh.materials.append(material)
    if vertex_colors is not None:
        apply_authored_vertex_colors(mesh, vertex_colors)
    elif vertex_color_fn is not None:
        apply_authored_vertex_colors(
            mesh,
            [
                vertex_color_fn(vertex.co.copy(), index)
                for index, vertex in enumerate(mesh.vertices)
            ],
        )
    else:
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
    triangle_range: tuple[int, int] = (18_000, 20_500),
) -> None:
    root = rig["root"]
    triangles = character_triangle_count(root)
    minimum, maximum = triangle_range
    if not minimum <= triangles <= maximum:
        raise RuntimeError(
            f"{root['asset_id']} triangles are outside the runtime budget "
            f"{minimum}-{maximum}: {triangles}"
        )
    root["silhouette_features"] = silhouette_features
    root["triangle_target"] = triangles
    root["render_mesh_target"] = sum(
        1 for obj in (root, *root.children_recursive) if obj.type == "MESH"
    )


def phoenix_body_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    height = min(1.0, max(0.0, point.z / 5.2))
    breast = math.exp(-((point.x / 0.72) ** 2)) * max(0.0, point.y + 0.15)
    if point.z < 1.12:
        return (0.19 + height * 0.28, 0.105 + height * 0.16, 0.060, 1.0)
    return (
        min(0.94, 0.38 + height * 0.36 + breast * 0.055),
        min(0.48, 0.035 + height * 0.12 + breast * 0.080),
        min(0.22, 0.022 + height * 0.032),
        1.0,
    )


def phoenix_feather_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    reach = min(1.0, max(0.0, abs(point.x) / 6.0))
    trailing = min(1.0, max(0.0, (-point.y + 0.4) / 2.0))
    return (
        min(0.94, 0.72 + reach * 0.16),
        min(0.52, 0.13 + reach * 0.22 + trailing * 0.08),
        min(0.22, 0.018 + reach * 0.09 + trailing * 0.035),
        1.0,
    )


def phoenix_head_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    if (
        0.13 < abs(point.x) < 0.48
        and 0.30 < point.y < 0.69
        and 0.04 < point.z < 0.34
    ):
        return (0.055, 0.026, 0.020, 1.0)
    if point.y > 0.46:
        hook = min(1.0, max(0.0, (point.y - 0.46) / 0.86))
        return (0.92, 0.42 - hook * 0.10, 0.035, 1.0)
    height = min(1.0, max(0.0, (point.z + 0.45) / 1.35))
    return (0.62 + height * 0.18, 0.065 + height * 0.06, 0.018, 1.0)


def append_phoenix_wing(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    colors: list[tuple[float, float, float, float]],
    *,
    side: int,
) -> None:
    # The narrow spar remains buried under three depth-separated feather fans.
    # Each row follows the arm rather than radiating from one exposed point, so
    # the shoulder reads as continuous anatomy instead of a bundle of slats.
    append_oriented_loft(
        vertices,
        faces,
        [
            (side * -0.24, 0.02, -0.03),
            (side * 0.92, 0.10, 0.30),
            (side * 2.08, 0.04, 0.74),
            (side * 3.05, -0.07, 1.12),
            (side * 3.62, -0.14, 1.34),
        ],
        [(0.12, 0.09), (0.105, 0.078), (0.074, 0.054), (0.045, 0.032), (0.025, 0.018)],
        sides=14,
    )
    colors.extend(
        phoenix_feather_color(Vector(point), index)
        for index, point in enumerate(vertices)
    )

    # Four inner primaries stay buried under the middle tier; seven outer
    # primaries alternate in reach and height to expose distinct tapered tips.
    primary_stagger = (0.00, 0.09, -0.035, 0.11, -0.045, 0.08, 0.00)
    for index in range(11):
        root_x = 1.10 + index * 0.14
        root = (
            side * root_x,
            -0.34 + index * 0.010,
            0.18 + index * 0.055,
        )
        if index < 4:
            tip_x = 3.55 + index * 0.18
            tip_z = 0.48 + index * 0.10
        else:
            exposed = index - 4
            tip_x = 4.10 + exposed * 0.225
            tip_z = 0.74 + exposed * 0.17 + primary_stagger[exposed]
        tip = (
            side * tip_x,
            -0.78 + index * 0.054,
            tip_z,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.138 - index * 0.0008,
            thickness=0.026,
            camber=0.070,
            bend=(0.0, -0.020, 0.11 + index * 0.006),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=8,
            width_steps=5,
            colors=colors,
            root_color=(0.42, 0.042 + index * 0.004, 0.025, 1.0),
            tip_color=(1.0, 0.60 + index * 0.018, 0.12, 1.0),
        )

    # Six inner secondaries disappear below the coverts; four outer tips form a
    # separate stepped edge between the covert row and long primaries.
    secondary_stagger = (0.00, 0.075, -0.035, 0.055)
    for index in range(10):
        root = (
            side * (0.48 + index * 0.142),
            -0.08 + index * 0.005,
            0.36 + index * 0.060,
        )
        if index < 6:
            tip_x = 2.00 + index * 0.16
            tip_z = 0.68 + index * 0.085
        else:
            exposed = index - 6
            tip_x = 2.96 + exposed * 0.27
            tip_z = 1.08 + exposed * 0.15 + secondary_stagger[exposed]
        tip = (
            side * tip_x,
            -0.26 + index * 0.022,
            tip_z,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.148 - index * 0.001,
            thickness=0.026,
            camber=0.075,
            bend=(0.0, -0.010, 0.11),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=8,
            width_steps=5,
            colors=colors,
            root_color=(0.57, 0.065, 0.022, 1.0),
            tip_color=(0.96, 0.43 + index * 0.018, 0.06, 1.0),
        )

    # Wide coverts hug the spar closely enough to hide it without merging the
    # narrower middle and outer tiers into one slab.
    for index in range(12):
        root = (
            side * (-0.08 + index * 0.108),
            0.02 - index * 0.004,
            0.28 + index * 0.052,
        )
        tip = (
            side * (1.10 + index * 0.137),
            -0.03 + index * 0.006,
            0.60 + index * 0.078,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.176 - index * 0.001,
            thickness=0.028,
            camber=0.08,
            bend=(0.0, 0.0, 0.10),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=8,
            width_steps=4,
            colors=colors,
            root_color=(0.38, 0.032, 0.025, 1.0),
            tip_color=(0.89, 0.28 + index * 0.011, 0.045, 1.0),
        )


def build_phoenix() -> bpy.types.Object:
    materials = character_materials(
        (0.86, 0.24, 0.08, 1.0),
        (1.0, 0.57, 0.12, 1.0),
        (0.18, 0.92, 0.94, 1.0),
    )
    rig = create_character_rig(
        "ember-phoenix",
        head_location=(0.0, 1.98, 4.33),
        wing_locations=((-0.56, 0.24, 3.48), (0.56, 0.24, 3.48)),
        tail_start=(0.0, -1.50, 2.58),
        tail_step=(0.0, -0.78, -0.025),
    )
    rig["back_socket"].location = (0.0, 0.02, 3.76)
    rig["head_socket"].location = (0.0, 0.32, 0.50)
    rig["eye_left"].location = (-0.31, 0.56, 0.17)
    rig["eye_right"].location = (0.31, 0.56, 0.17)
    rig["tail_socket"].parent = rig["tail_3"]
    rig["tail_socket"].location = (0.0, -0.34, 0.16)

    body_vertices: list[tuple[float, float, float]] = []
    body_faces: list[tuple[int, int, int]] = []
    append_oriented_loft(
        body_vertices,
        body_faces,
        [
            (0.0, -1.52, 2.50),
            (0.0, -1.12, 2.68),
            (0.0, -0.64, 2.94),
            (0.0, -0.08, 3.08),
            (0.0, 0.48, 3.28),
            (0.0, 1.08, 3.70),
            (0.0, 1.52, 4.08),
            (0.0, 1.86, 4.33),
        ],
        [
            (0.35, 0.42),
            (0.58, 0.64),
            (0.72, 0.82),
            (0.79, 0.86),
            (0.68, 0.82),
            (0.508, 0.68),
            (0.357, 0.50),
            (0.263, 0.36),
        ],
        sides=28,
    )

    for side in (-1, 1):
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            (side * 0.42, -0.12, 2.34),
            (0.36, 0.44, 0.58),
            segments=20,
            rings=10,
            rotation=(0.06, 0.0, -side * 0.08),
        )
        append_oriented_loft(
            body_vertices,
            body_faces,
            [
                (side * 0.42, -0.14, 2.60),
                (side * 0.49, -0.62, 1.58),
                (side * 0.35, -0.18, 0.76),
                (side * 0.40, 0.32, 0.32),
                (side * 0.40, 0.52, 0.18),
            ],
            [(0.25, 0.31), (0.21, 0.25), (0.16, 0.205), (0.12, 0.15), (0.15, 0.10)],
            sides=14,
        )
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            (side * 0.40, 0.49, 0.185),
            (0.22, 0.25, 0.13),
            segments=16,
            rings=8,
            rotation=(0.04, 0.0, 0.0),
        )
        toe_offsets = (-0.15, 0.0, 0.15)
        for toe_offset in toe_offsets:
            start = (side * 0.40 + toe_offset, 0.54, 0.180)
            knuckle = (side * 0.40 + toe_offset * 1.18, 0.75, 0.155)
            append_oriented_loft(
                body_vertices,
                body_faces,
                [start, knuckle],
                [(0.10, 0.085), (0.084, 0.070)],
                sides=10,
            )
            claw_middle = (side * 0.40 + toe_offset * 1.38, 0.90, 0.078)
            tip = (side * 0.40 + toe_offset * 1.52, 1.00, 0.038)
            append_tapered_claw(
                body_vertices,
                body_faces,
                knuckle,
                claw_middle,
                tip,
                0.082,
                sides=10,
            )
        append_tapered_claw(
            body_vertices,
            body_faces,
            (side * 0.47, 0.45, 0.178),
            (side * 0.58, 0.10, 0.110),
            (side * 0.69, -0.22, 0.038),
            0.095,
            sides=10,
        )

    chest_vertices: list[tuple[float, float, float]] = []
    chest_faces: list[tuple[int, int, int]] = []
    chest_colors: list[tuple[float, float, float, float]] = []
    for row in range(5):
        count = 4 + row
        for column in range(count):
            across = column - (count - 1) * 0.5
            root = (
                across * (0.26 - row * 0.012),
                0.78 - row * 0.33,
                3.78 - row * 0.23 + abs(across) * 0.025,
            )
            tip = (
                root[0] * 1.08,
                root[1] - 0.32,
                root[2] - (0.52 + row * 0.045),
            )
            append_feather_leaf(
                chest_vertices,
                chest_faces,
                root,
                tip,
                0.21 + row * 0.014,
                thickness=0.026,
                camber=0.055,
                bend=(0.0, -0.04, 0.03),
                surface_normal=(0.0, 1.0, 0.0),
                length_steps=6,
                width_steps=4,
                colors=chest_colors,
                root_color=(0.42, 0.055, 0.028, 1.0),
                tip_color=(0.95, 0.54 - row * 0.060, 0.09, 1.0),
            )

    make_mesh(
        "Phoenix_BodyLoft",
        body_vertices,
        body_faces,
        materials["base"],
        rig["root"],
        smooth=False,
        vertex_color_fn=phoenix_body_color,
    )
    make_mesh(
        "Phoenix_ChestFeathers",
        chest_vertices,
        chest_faces,
        materials["membrane"],
        rig["root"],
        smooth=False,
        vertex_colors=chest_colors,
    )

    for side, parent, name in (
        (-1, rig["left"], "Phoenix_Wing_L"),
        (1, rig["right"], "Phoenix_Wing_R"),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        colors: list[tuple[float, float, float, float]] = []
        append_phoenix_wing(vertices, faces, colors, side=side)
        make_mesh(
            name,
            vertices,
            faces,
            materials["membrane"],
            parent,
            smooth=False,
            vertex_colors=colors,
        )

    head_vertices: list[tuple[float, float, float]] = []
    head_faces: list[tuple[int, int, int]] = []
    append_oriented_loft(
        head_vertices,
        head_faces,
        [
            (0.0, -0.48, 0.00),
            (0.0, -0.18, 0.10),
            (0.0, 0.18, 0.08),
            (0.0, 0.46, 0.00),
            (0.0, 0.62, -0.08),
        ],
        [(0.286, 0.355), (0.492, 0.527), (0.549, 0.481), (0.446, 0.355), (0.286, 0.229)],
        sides=16,
    )
    append_oriented_loft(
        head_vertices,
        head_faces,
        [
            (0.0, 0.42, -0.08),
            (0.0, 0.86, -0.06),
            (0.0, 1.16, -0.14),
            (0.0, 1.30, -0.36),
        ],
        [(0.36, 0.25), (0.25, 0.17), (0.13, 0.09), (0.025, 0.018)],
        sides=10,
    )
    mantle_specs = (
        ((0.00, -0.38, -0.02), (0.00, -0.86, -0.72), 0.18),
        ((-0.15, -0.32, 0.00), (-0.28, -0.78, -0.62), 0.16),
        ((0.15, -0.32, 0.00), (0.28, -0.78, -0.62), 0.16),
        ((-0.28, -0.22, -0.02), (-0.42, -0.66, -0.50), 0.14),
        ((0.28, -0.22, -0.02), (0.42, -0.66, -0.50), 0.14),
    )
    for root, tip, half_width in mantle_specs:
        append_feather_leaf(
            head_vertices,
            head_faces,
            root,
            tip,
            half_width,
            thickness=0.024,
            camber=0.050,
            bend=(tip[0] * 0.08, -0.03, -0.04),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=6,
            width_steps=4,
        )
    collar_specs = (
        ((-0.30, -0.31, -0.27), (-0.40, -0.55, -0.52), 0.125),
        ((-0.18, -0.36, -0.29), (-0.24, -0.61, -0.58), 0.135),
        ((-0.06, -0.39, -0.30), (-0.08, -0.66, -0.61), 0.14),
        ((0.06, -0.39, -0.30), (0.08, -0.66, -0.61), 0.14),
        ((0.18, -0.36, -0.29), (0.24, -0.61, -0.58), 0.135),
        ((0.30, -0.31, -0.27), (0.40, -0.55, -0.52), 0.125),
    )
    for root, tip, half_width in collar_specs:
        append_feather_leaf(
            head_vertices,
            head_faces,
            root,
            tip,
            half_width,
            thickness=0.022,
            camber=0.042,
            bend=(tip[0] * 0.05, -0.02, -0.025),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=5,
            width_steps=4,
        )
    crown_vertices: list[tuple[float, float, float]] = []
    crown_faces: list[tuple[int, int, int]] = []
    crown_colors: list[tuple[float, float, float, float]] = []
    crown_specs = (
        (0.00, (0.00, 0.27, 0.28), (0.00, -0.66, 1.02), 0.115),
        (-0.17, (-0.17, 0.18, 0.25), (-0.32, -0.74, 0.88), 0.105),
        (0.17, (0.17, 0.18, 0.25), (0.32, -0.74, 0.88), 0.105),
        (-0.11, (-0.11, -0.02, 0.27), (-0.25, -0.94, 0.78), 0.100),
        (0.11, (0.11, -0.02, 0.27), (0.25, -0.94, 0.78), 0.100),
        (-0.06, (-0.06, -0.22, 0.18), (-0.16, -1.14, 0.60), 0.092),
        (0.06, (0.06, -0.22, 0.18), (0.16, -1.14, 0.60), 0.092),
    )
    for side_offset, root, tip, half_width in crown_specs:
        append_feather_leaf(
            crown_vertices,
            crown_faces,
            root,
            tip,
            half_width,
            thickness=0.022,
            camber=0.046,
            bend=(side_offset * 0.08, -0.09, 0.035),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=7,
            width_steps=4,
            colors=crown_colors,
            root_color=(0.46, 0.028, 0.018, 1.0),
            tip_color=(1.0, 0.65, 0.13, 1.0),
        )
    for side in (-1, 1):
        for index in range(3):
            root = (
                side * (0.28 + index * 0.045),
                -0.06 - index * 0.08,
                0.10 - index * 0.07,
            )
            tip = (
                side * (0.56 + index * 0.10),
                -0.34 - index * 0.12,
                0.02 - index * 0.15,
            )
            append_feather_leaf(
                crown_vertices,
                crown_faces,
                root,
                tip,
                0.10,
                thickness=0.02,
                camber=0.035,
                surface_normal=(0.0, 1.0, 0.0),
                length_steps=6,
                width_steps=4,
                colors=crown_colors,
                root_color=(0.52, 0.045, 0.025, 1.0),
                tip_color=(0.97, 0.40, 0.06, 1.0),
            )
    make_mesh(
        "Phoenix_AvianHeadBeak",
        head_vertices,
        head_faces,
        materials["base"],
        rig["head"],
        smooth=False,
        vertex_color_fn=phoenix_head_color,
    )
    make_mesh(
        "Phoenix_CrownCheekFeathers",
        crown_vertices,
        crown_faces,
        materials["membrane"],
        rig["head"],
        smooth=False,
        vertex_colors=crown_colors,
    )

    jaw_vertices: list[tuple[float, float, float]] = []
    jaw_faces: list[tuple[int, int, int]] = []
    append_oriented_loft(
        jaw_vertices,
        jaw_faces,
        [
            (0.0, 0.00, 0.03),
            (0.0, 0.38, -0.01),
            (0.0, 0.66, -0.09),
            (0.0, 0.78, -0.22),
        ],
        [(0.29, 0.12), (0.21, 0.095), (0.10, 0.055), (0.024, 0.016)],
        sides=10,
    )
    make_mesh(
        "Phoenix_JawBeak",
        jaw_vertices,
        jaw_faces,
        materials["base"],
        rig["jaw"],
        smooth=False,
        vertex_color_fn=phoenix_head_color,
    )

    for side_name, parent in (("L", rig["eye_left"]), ("R", rig["eye_right"])):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        add_ellipsoid_part(
            vertices,
            faces,
            (0.0, 0.0, 0.0),
            (0.082, 0.045, 0.062),
            segments=14,
            rings=7,
        )
        make_mesh(f"Phoenix_Eye_{side_name}", vertices, faces, materials["glow"], parent)

    for index in range(1, 6):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        colors: list[tuple[float, float, float, float]] = []
        # Every segment extends beyond 1.02 units while the rig advances only
        # 0.78, guaranteeing a hidden overlap instead of visible ring gaps.
        segment_length = 1.10 if index < 5 else 1.06
        local_y_values = (
            0.10,
            -segment_length * 0.14,
            -segment_length * 0.36,
            -segment_length * 0.58,
            -segment_length * 0.80,
            -segment_length,
        )
        segment_centers = [(0.0, local_y, local_y * 0.032) for local_y in local_y_values]
        segment_radii: list[tuple[float, float]] = []
        nesting = 1.0 - (index - 1) * 0.006
        for _x, local_y, _z in segment_centers:
            distance = max(0.0, (index - 1) * 0.78 - local_y)
            radius = max(0.052, 0.25 * math.exp(-0.31 * distance)) * nesting
            segment_radii.append((radius, radius * 0.82))
        append_oriented_loft(
            vertices,
            faces,
            segment_centers,
            segment_radii,
            sides=12,
        )
        colors.extend(
            phoenix_feather_color(Vector(point), vertex_index)
            for vertex_index, point in enumerate(vertices)
        )
        if index == 5:
            plume_specs = (
                (
                    (0.12, -0.98, -0.10),
                    (2.30, -2.60, -1.40),
                    0.24,
                    (1.0, 0.0, 0.0),
                    (0.40, 0.0, -0.20),
                    (0.45, 0.26, 0.48),
                ),
                (
                    (0.00, -0.46, 0.22),
                    (0.00, -3.95, 1.25),
                    0.21,
                    (0.64, 0.0, 0.77),
                    (0.0, 0.0, 0.38),
                    (0.34, 0.28, -0.38),
                ),
                (
                    (0.18, -0.62, 0.18),
                    (1.55, -3.55, 0.55),
                    0.20,
                    (0.62, 0.0, 0.78),
                    (0.32, 0.0, 0.24),
                    (0.32, 0.25, -0.28),
                ),
            )
            for root, tip, half_width, normal, bend, split_offset in plume_specs:
                append_feather_leaf(
                    vertices,
                    faces,
                    root,
                    tip,
                    half_width,
                    thickness=0.025,
                    camber=0.075,
                    bend=bend,
                    surface_normal=normal,
                    length_steps=11,
                    width_steps=4,
                    colors=colors,
                    root_color=(0.51, 0.045, 0.025, 1.0),
                    tip_color=(1.0, 0.71, 0.17, 1.0),
                )
                split_root = tuple(Vector(root).lerp(Vector(tip), 0.55))
                split_tip = tuple(Vector(tip) + Vector(split_offset))
                append_feather_leaf(
                    vertices,
                    faces,
                    split_root,
                    split_tip,
                    0.105,
                    thickness=0.021,
                    camber=0.050,
                    bend=tuple(Vector(bend) * 0.35),
                    surface_normal=normal,
                    length_steps=5,
                    width_steps=3,
                    colors=colors,
                    root_color=(0.81, 0.25, 0.035, 1.0),
                    tip_color=(1.0, 0.80, 0.25, 1.0),
                )
        make_mesh(
            f"Phoenix_TailPlumes_{index}",
            vertices,
            faces,
            materials["membrane"],
            rig[f"tail_{index}"],
            smooth=False,
            vertex_colors=colors,
        )

    finish_character(
        rig,
        silhouette_features=(
            "continuous-avian-loft angular-cranium three-feather-layers "
            "seven-back-swept-flame-crown bent-ankles three-forward-hallux-talons "
            "overlapped-pelvis-taper triple-cambered-tail-plumes"
        ),
        triangle_range=(22_000, 28_000),
    )
    return rig["root"]


def tiger_stripe_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    dark = (0.025, 0.045, 0.072, 1.0)
    # Curved, tapering bands follow the flank instead of repeating as parallel
    # rings; soft countershading makes the chest and haunch planes distinct.
    upper = min(1.0, max(0.0, (point.z - 0.6) / 2.7))
    flank = min(1.0, abs(point.x) / 1.05)
    white = (
        0.91 - upper * 0.15 - flank * 0.07,
        0.91 - upper * 0.095 - flank * 0.045,
        0.90 + upper * 0.045,
        1.0,
    )
    phase = (point.y * 4.3 + abs(point.x) * 2.5 - point.z * 0.85
             + math.sin(point.z * 2.2 + point.y * 1.4) * 0.32)
    stripe_width = 0.23 + 0.18 * upper
    stripe = abs(math.sin(phase)) < stripe_width
    side_or_back = abs(point.x) > 0.16 or point.z > 2.22
    limb_band = (
        abs(point.x) > 0.42
        and 0.30 < point.z < 2.55
        and abs(math.sin(point.z * 6.8 + point.y * 1.1)) < 0.52
    )
    if point.z < 0.14:
        return dark
    if (stripe and side_or_back) or limb_band:
        return dark
    return white


def tiger_head_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    dark = (0.025, 0.045, 0.072, 1.0)
    crown = min(1.0, max(0.0, (point.z + 0.1) / 0.65))
    white = (0.94 - crown * 0.18, 0.93 - crown * 0.105, 0.91 + crown * 0.04, 1.0)
    ax = abs(point.x)
    ear_dark = (
        point.z > 0.33
        and ax > 0.20
        and -0.16 < point.y < -0.04
    )
    eye_mask = (
        0.12 < ax < 0.46
        and 0.18 < point.z < 0.30
        and abs(point.y - (0.44 - ax * 0.32)) < 0.042
    )
    forehead_half_width = 0.045 + max(0.0, 0.34 - point.z) * 0.16
    central = (
        -0.20 < point.y < 0.16
        and 0.18 < point.z < 0.39
        and ax < forehead_half_width
    )
    upper_cheek = (
        0.26 < ax < 0.56
        and 0.02 < point.y < 0.30
        and -0.08 < point.z < 0.14
        and abs(point.z - (point.y * 0.60 - 0.08)) < 0.045
    )
    lower_cheek = (
        0.28 < ax < 0.58
        and -0.10 < point.y < 0.18
        and -0.20 < point.z < 0.02
        and abs(point.z - (point.y * 0.55 - 0.14)) < 0.045
    )
    nose = point.y > 0.49 and point.z < 0.055 and ax < 0.235
    forehead_bars = (
        point.z > 0.20 and -0.18 < point.y < 0.20 and ax < 0.40
        and abs(math.sin((point.y + ax * 0.34) * 20.0)) < 0.30
    )
    if ear_dark or eye_mask or central or forehead_bars or upper_cheek or lower_cheek or nose:
        return dark
    return white


def tiger_muzzle_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    chin = min(1.0, max(0.0, (-point.z - 0.06) / 0.30))
    return (0.97 - chin * 0.19, 0.94 - chin * 0.14, 0.86 - chin * 0.04, 1.0)


def tiger_wing_color(
    point: Vector, _index: int
) -> tuple[float, float, float, float]:
    reach = min(1.0, max(0.0, abs(point.x) / 5.5))
    charcoal_tip = max(0.0, (reach - 0.55) / 0.45)
    return (
        0.80 - charcoal_tip * 0.64,
        0.84 - charcoal_tip * 0.64,
        0.92 - charcoal_tip * 0.66,
        1.0,
    )


def append_tiger_wing(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int]],
    colors: list[tuple[float, float, float, float]],
    *,
    side: int,
) -> None:
    append_oriented_loft(
        vertices,
        faces,
        [
            (side * -0.30, 0.10, -0.08),
            (side * 0.28, 0.04, 0.00),
            (side * 1.05, -0.06, 0.08),
            (side * 2.10, -0.18, 0.16),
            (side * 3.25, -0.36, 0.25),
            (side * 4.15, -0.54, 0.34),
        ],
        [
            (0.34, 0.26),
            (0.46, 0.31),
            (0.40, 0.26),
            (0.28, 0.18),
            (0.13, 0.085),
            (0.04, 0.03),
        ],
        sides=16,
    )
    colors.extend(
        tiger_wing_color(Vector(point), index)
        for index, point in enumerate(vertices)
    )

    for index in range(10):
        root = (
            side * (0.45 + index * 0.17),
            -0.18 + index * 0.020,
            0.10 + index * 0.015,
        )
        tip = (
            side * (3.25 + index * 0.23),
            -1.20 + index * 0.090,
            0.28 + index * 0.015,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.23,
            thickness=0.034,
            camber=0.095,
            bend=(0.0, -0.02, 0.06),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=8,
            width_steps=5,
            colors=colors,
            root_color=(0.79, 0.85, 0.92, 1.0),
            tip_color=(0.08 + index * 0.008, 0.14 + index * 0.009, 0.22 + index * 0.012, 1.0),
        )

    for index in range(8):
        root = (
            side * (0.15 + index * 0.16),
            0.00 + index * 0.015,
            0.02 + index * 0.014,
        )
        tip = (
            side * (2.00 + index * 0.25),
            -0.45 + index * 0.065,
            0.20 + index * 0.018,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.21,
            thickness=0.032,
            camber=0.10,
            bend=(0.0, 0.0, 0.05),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=8,
            width_steps=5,
            colors=colors,
            root_color=(0.50, 0.61, 0.73, 1.0),
            tip_color=(0.88, 0.92, 0.96, 1.0),
        )
    for index in range(10):
        root = (
            side * (-0.18 + index * 0.10),
            0.18 + index * 0.010,
            -0.05 + index * 0.012,
        )
        tip = (
            side * (0.85 + index * 0.18),
            0.05 + index * 0.040,
            0.12 + index * 0.015,
        )
        append_feather_leaf(
            vertices,
            faces,
            root,
            tip,
            0.20,
            thickness=0.030,
            camber=0.09,
            bend=(0.0, 0.0, 0.04),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=7,
            width_steps=4,
            colors=colors,
            root_color=(0.41, 0.52, 0.65, 1.0),
            tip_color=(0.96, 0.96, 0.92, 1.0),
        )


def build_white_tiger() -> bpy.types.Object:
    materials = character_materials(
        (0.90, 0.93, 0.98, 1.0),
        (0.68, 0.72, 0.80, 1.0),
        (0.32, 0.91, 0.98, 1.0),
    )
    rig = create_character_rig(
        "storm-white-tiger",
        head_location=(0.0, 1.38, 2.92),
        wing_locations=((-0.56, 0.10, 3.14), (0.56, 0.10, 3.14)),
        tail_start=(0.0, -1.50, 2.03),
        tail_step=(0.14, -0.88, 0.120),
    )
    rig["back_socket"].location = (0.0, 0.18, 3.58)
    rig["head_socket"].location = (0.0, 0.42, 0.48)
    rig["jaw"].location = (0.0, 0.32, -0.09)
    rig["eye_left"].location = (-0.29, 0.37, 0.22)
    rig["eye_right"].location = (0.29, 0.37, 0.22)
    rig["tail_2"].location = (0.14, -0.88, 0.120)
    rig["tail_3"].location = (-0.26, -0.84, -0.200)
    rig["tail_4"].location = (-0.18, -0.82, -0.160)
    rig["tail_5"].location = (0.32, -0.80, 0.240)
    for index in range(1, 6):
        rig[f"tail_{index}"].rotation_euler = (0.0, 0.0, 0.0)
    rig["tail_socket"].location = (0.18, -1.14, 0.18)

    body_vertices: list[tuple[float, float, float]] = []
    body_faces: list[tuple[int, int, int]] = []
    body_centers, body_radii = subdivide_loft_profile(
        [
            (0.0, -1.62, 1.82),
            (0.0, -1.40, 1.94),
            (0.0, -1.12, 2.06),
            (0.0, -0.82, 2.10),
            (0.0, -0.52, 2.08),
            (0.0, -0.22, 2.14),
            (0.0, 0.08, 2.26),
            (0.0, 0.38, 2.40),
            (0.0, 0.68, 2.54),
            (0.0, 0.94, 2.68),
            (0.0, 1.16, 2.84),
            (0.0, 1.36, 3.00),
            (0.0, 1.48, 3.10),
        ],
        [
            (0.68, 0.56),
            (0.90, 0.76),
            (1.08, 0.92),
            (1.04, 0.88),
            (0.84, 0.72),
            (0.80, 0.68),
            (0.92, 0.78),
            (1.02, 0.90),
            (1.10, 0.98),
            (1.02, 0.92),
            (0.84, 0.80),
            (0.62, 0.66),
            (0.48, 0.52),
        ],
        subdivisions=3,
    )
    append_oriented_loft(
        body_vertices,
        body_faces,
        body_centers,
        body_radii,
        sides=28,
    )

    leg_specs = (
        (-1, "front", -0.68, 0.70),
        (1, "front", 0.68, 0.70),
        (-1, "hind", -0.72, -1.02),
        (1, "hind", 0.72, -1.02),
    )
    for _side, kind, x, y in leg_specs:
        if kind == "front":
            centers = [
                (x, y, 2.78),
                (x * 1.16, y - 0.16, 2.15),
                (x * 1.30, y - 0.28, 1.56),
                (x * 1.02, y - 0.02, 0.90),
                (x * 0.82, y + 0.22, 0.54),
                (x * 0.92, y + 0.38, 0.32),
                (x, y + 0.54, 0.20),
                (x, y + 0.70, 0.14),
            ]
            radii = [
                (0.40, 0.46),
                (0.36, 0.40),
                (0.28, 0.32),
                (0.22, 0.25),
                (0.18, 0.20),
                (0.20, 0.16),
                (0.29, 0.12),
                (0.34, 0.11),
            ]
            paw_y = y + 0.48
            palm_center = (x, paw_y + 0.18, 0.175)
            palm_radii = (0.36, 0.34, 0.125)
            palm_rotation = (0.05, 0.0, 0.0)
            toe_spacing = 0.130
            toe_z = 0.145
            toe_radii = (0.120, 0.230, 0.100)
            claw_start_z = 0.140
            claw_mid_z = 0.085
            claw_radius = 0.050
            toe_angle_step = 4.5
        else:
            add_ellipsoid_part(
                body_vertices,
                body_faces,
                (x * 1.04, y + 0.06, 1.90),
                (0.50, 0.58, 0.66),
                segments=20,
                rings=10,
                rotation=(0.06, 0.0, -x * 0.05),
            )
            centers = [
                (x, y, 2.16),
                (x * 1.10, y + 0.14, 1.74),
                (x * 1.16, y + 0.24, 1.34),
                (x * 1.08, y + 0.06, 1.02),
                (x * 0.98, y - 0.14, 0.72),
                (x * 0.92, y - 0.12, 0.50),
                (x * 0.90, y + 0.04, 0.34),
                (x * 0.95, y + 0.32, 0.22),
                (x, y + 0.62, 0.15),
            ]
            radii = [
                (0.46, 0.52),
                (0.43, 0.48),
                (0.34, 0.38),
                (0.28, 0.31),
                (0.24, 0.27),
                (0.21, 0.23),
                (0.20, 0.18),
                (0.28, 0.14),
                (0.33, 0.11),
            ]
            paw_y = y + 0.48
            palm_center = (x, paw_y + 0.16, 0.155)
            palm_radii = (0.34, 0.34, 0.11)
            palm_rotation = (0.04, 0.0, 0.0)
            toe_spacing = 0.110
            toe_z = 0.125
            toe_radii = (0.095, 0.190, 0.080)
            claw_start_z = 0.115
            claw_mid_z = 0.072
            claw_radius = 0.043
            toe_angle_step = 3.5
        append_oriented_loft(
            body_vertices, body_faces, centers, radii, sides=16
        )
        add_ellipsoid_part(
            body_vertices,
            body_faces,
            palm_center,
            palm_radii,
            segments=20,
            rings=10,
            rotation=palm_rotation,
        )
        for toe_index in range(4):
            fan = toe_index - 1.5
            angle = math.radians(toe_angle_step * fan)
            toe_x = x + fan * toe_spacing
            toe_y = (
                paw_y + 0.43 - abs(fan) * 0.01
                if kind == "front"
                else paw_y + 0.46
            )
            add_ellipsoid_part(
                body_vertices,
                body_faces,
                (toe_x, toe_y, toe_z),
                toe_radii,
                segments=12,
                rings=7,
                rotation=(0.04, 0.0, angle),
            )
            claw_dx = math.sin(angle)
            claw_dy = math.cos(angle)
            append_tapered_claw(
                body_vertices,
                body_faces,
                (toe_x + claw_dx * 0.10, toe_y + claw_dy * 0.10, claw_start_z),
                (toe_x + claw_dx * 0.23, toe_y + claw_dy * 0.23, claw_mid_z),
                (toe_x + claw_dx * 0.34, toe_y + claw_dy * 0.34, 0.040),
                claw_radius,
                sides=8,
            )

    for side in (-1, 1):
        append_oriented_loft(
            body_vertices,
            body_faces,
            [
                (side * 0.32, 0.46, 3.10),
                (side * 0.40, 0.26, 3.11),
                (side * 0.46, 0.02, 3.07),
                (side * 0.44, -0.24, 2.98),
            ],
            [(0.20, 0.15), (0.26, 0.18), (0.28, 0.20), (0.18, 0.12)],
            sides=12,
        )
        for index in range(5):
            root = (
                side * (0.34 + index * 0.020),
                0.48 - index * 0.06,
                3.13 - index * 0.015,
            )
            tip = (
                side * (0.52 + index * 0.025),
                -0.18 - index * 0.11,
                2.98 - index * 0.040,
            )
            append_feather_leaf(
                body_vertices,
                body_faces,
                root,
                tip,
                0.26 - index * 0.012,
                thickness=0.030,
                camber=0.050,
                bend=(side * 0.035, -0.10, -0.025),
                surface_normal=(side, 0.0, 0.0),
                length_steps=5,
                width_steps=3,
            )
        for index in range(4):
            append_feather_leaf(
                body_vertices,
                body_faces,
                (
                    side * (0.42 + index * 0.025),
                    0.22 - index * 0.08,
                    3.05 - index * 0.025,
                ),
                (
                    side * (0.56 + index * 0.030),
                    -0.72 - index * 0.20,
                    2.78 - index * 0.080,
                ),
                0.19 - index * 0.008,
                thickness=0.026,
                camber=0.055,
                bend=(side * 0.030, -0.12, -0.040),
                surface_normal=(side, 0.0, 0.0),
                length_steps=5,
                width_steps=3,
            )
        for index in range(3):
            append_feather_leaf(
                body_vertices,
                body_faces,
                (
                    side * (0.46 + index * 0.030),
                    0.0 - index * 0.09,
                    2.97 - index * 0.040,
                ),
                (
                    side * (0.54 + index * 0.025),
                    -1.18 - index * 0.21,
                    2.54 - index * 0.090,
                ),
                0.17 - index * 0.010,
                thickness=0.025,
                camber=0.060,
                bend=(side * 0.025, -0.14, -0.050),
                surface_normal=(side, 0.0, 0.0),
                length_steps=5,
                width_steps=3,
            )

    body_colors = [
        tiger_stripe_color(Vector(point), index)
        for index, point in enumerate(body_vertices)
    ]

    make_mesh(
        "WhiteTiger_BodyHide",
        body_vertices,
        body_faces,
        materials["base"],
        rig["root"],
        smooth=True,
        vertex_colors=body_colors,
    )

    for side, parent, name in (
        (-1, rig["left"], "WhiteTiger_Wing_L"),
        (1, rig["right"], "WhiteTiger_Wing_R"),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        colors: list[tuple[float, float, float, float]] = []
        append_tiger_wing(vertices, faces, colors, side=side)
        make_mesh(
            name,
            vertices,
            faces,
            materials["membrane"],
            parent,
            smooth=False,
            vertex_colors=colors,
        )

    head_vertices: list[tuple[float, float, float]] = []
    head_faces: list[tuple[int, int, int]] = []
    append_oriented_loft(
        head_vertices,
        head_faces,
        [
            (0.0, -0.34, 0.00),
            (0.0, -0.16, 0.03),
            (0.0, 0.02, 0.05),
            (0.0, 0.18, 0.04),
            (0.0, 0.30, 0.01),
        ],
        [(0.34, 0.23), (0.52, 0.26), (0.56, 0.24), (0.50, 0.19), (0.38, 0.15)],
        sides=18,
    )
    for side in (-1, 1):
        add_ellipsoid_part(
            head_vertices,
            head_faces,
            (side * 0.30, 0.08, -0.11),
            (0.23, 0.15, 0.19),
            segments=20,
            rings=10,
            rotation=(0.02, 0.0, -side * 0.04),
        )
        append_feather_leaf(
            head_vertices,
            head_faces,
            (side * 0.43, -0.10, 0.22),
            (side * 0.60, -0.055, 0.47),
            0.145,
            thickness=0.030,
            camber=0.055,
            bend=(side * 0.025, 0.025, -0.015),
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=6,
            width_steps=4,
        )
        append_wedge(
            head_vertices,
            head_faces,
            (side * 0.42, -0.12, 0.16),
            (0.22, 0.28, 0.13),
        )
    append_oriented_loft(
        head_vertices,
        head_faces,
        [
            (0.0, 0.10, -0.01),
            (0.0, 0.27, -0.03),
            (0.0, 0.43, -0.05),
            (0.0, 0.54, -0.065),
        ],
        [(0.32, 0.21), (0.30, 0.18), (0.24, 0.145), (0.17, 0.10)],
        sides=12,
    )
    add_ellipsoid_part(
        head_vertices,
        head_faces,
        (0.0, 0.575, -0.035),
        (0.18, 0.080, 0.078),
        segments=14,
        rings=7,
    )
    for side in (-1, 1):
        for index in range(4):
            root = (
                side * (0.27 + index * 0.028),
                0.10 - index * 0.065,
                0.03 - index * 0.035,
            )
            tip = (
                side * (0.56 + index * 0.040),
                -0.16 - index * 0.10,
                -0.02 - index * 0.055,
            )
            append_feather_leaf(
                head_vertices,
                head_faces,
                root,
                tip,
                0.115,
                thickness=0.022,
                camber=0.035,
                bend=(side * 0.035, -0.03, -0.02),
                surface_normal=(0.0, 1.0, 0.0),
                length_steps=5,
                width_steps=3,
            )
    for side in (-1, 1):
        append_feather_leaf(
            head_vertices,
            head_faces,
            (side * 0.12, 0.40, 0.25),
            (side * 0.44, 0.29, 0.28),
            0.040,
            thickness=0.010,
            camber=0.008,
            surface_normal=(0.0, 1.0, 0.0),
            length_steps=4,
            width_steps=2,
        )
    head_colors = [
        tiger_head_color(Vector(point), index)
        for index, point in enumerate(head_vertices)
    ]

    make_mesh(
        "WhiteTiger_HeadMane",
        head_vertices,
        head_faces,
        materials["base"],
        rig["head"],
        smooth=False,
        vertex_colors=head_colors,
    )

    jaw_vertices: list[tuple[float, float, float]] = []
    jaw_faces: list[tuple[int, int, int]] = []
    append_oriented_loft(
        jaw_vertices,
        jaw_faces,
        [
            (0.0, -0.08, -0.060),
            (0.0, 0.00, -0.075),
            (0.0, 0.08, -0.085),
            (0.0, 0.15, -0.095),
            (0.0, 0.22, -0.105),
            (0.0, 0.28, -0.110),
        ],
        [(0.30, 0.210), (0.34, 0.235), (0.36, 0.245), (0.35, 0.230), (0.31, 0.205), (0.23, 0.160)],
        sides=8,
        rolls=[math.pi / 8.0] * 6,
    )
    make_mesh(
        "WhiteTiger_JawMuzzle",
        jaw_vertices,
        jaw_faces,
        materials["base"],
        rig["jaw"],
        smooth=False,
        vertex_color_fn=tiger_muzzle_color,
    )

    for side_name, side, parent in (
        ("L", -1, rig["eye_left"]),
        ("R", 1, rig["eye_right"]),
    ):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        add_ellipsoid_part(
            vertices,
            faces,
            (0.0, 0.0, 0.0),
            (0.105, 0.043, 0.050),
            segments=14,
            rings=7,
            rotation=(0.0, -side * 0.14, 0.0),
        )
        make_mesh(
            f"WhiteTiger_Eye_{side_name}", vertices, faces, materials["glow"], parent
        )

    tail_links = (
        Vector((0.14, -0.88, 0.120)),
        Vector((-0.26, -0.84, -0.200)),
        Vector((-0.18, -0.82, -0.160)),
        Vector((0.32, -0.80, 0.240)),
        Vector((0.18, -1.14, 0.18)),
    )
    tail_y_offsets = (0.0, 0.88, 1.72, 2.54, 3.34)
    tail_boundary_radii = (0.29, 0.265, 0.235, 0.205, 0.17, 0.105)
    for index in range(1, 6):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int]] = []
        p0 = Vector((0.0, 0.0, 0.0))
        p3 = tail_links[index - 1]
        following = tail_links[index] if index < 5 else tail_links[-1]
        p1 = p3 * 0.33
        p2 = p3 - following * 0.22
        centers: list[tuple[float, float, float]] = []
        for station in range(6):
            progress = station / 5.0
            inverse = 1.0 - progress
            point = (
                p0 * (inverse ** 3)
                + p1 * (3.0 * inverse * inverse * progress)
                + p2 * (3.0 * inverse * progress * progress)
                + p3 * (progress ** 3)
            )
            centers.append(tuple(point))
        start_radius = tail_boundary_radii[index - 1]
        end_radius = tail_boundary_radii[index]
        radii = []
        for station in range(len(centers)):
            progress = station / (len(centers) - 1)
            radius = start_radius + (end_radius - start_radius) * progress
            radii.append((radius, radius * 0.88))
        append_oriented_loft(
            vertices,
            faces,
            centers,
            radii,
            sides=14,
            cap_start=index == 1,
            cap_end=index == 5,
        )
        if index == 5:
            for feather_index in range(8):
                fan = feather_index - 3.5
                bias = 1.0 - abs(fan) / 3.5
                append_feather_leaf(
                    vertices,
                    faces,
                    (0.20 + fan * 0.012, -1.04, 0.18 + bias * 0.02),
                    (
                        0.22 + fan * 0.13,
                        -1.90 - bias * 0.10,
                        0.24 + bias * 0.26,
                    ),
                    0.12 + bias * 0.035,
                    thickness=0.028,
                    camber=0.065,
                    bend=(fan * 0.02, -0.03, bias * 0.08),
                    surface_normal=(0.0, 1.0, 0.0),
                    length_steps=4,
                    width_steps=3,
                )

        def tail_color(
            point: Vector, _vertex_index: int, *, segment_index: int = index
        ) -> tuple[float, float, float, float]:
            dark = (0.02, 0.03, 0.045, 1.0)
            white = (0.88, 0.91, 0.98, 1.0)
            global_y = point.y - tail_y_offsets[segment_index - 1]
            if segment_index == 5 and point.y < -1.20:
                return dark
            if abs(math.sin(global_y * 9.6)) < 0.20:
                return dark
            return white

        make_mesh(
            f"WhiteTiger_Tail_{index}",
            vertices,
            faces,
            materials["base"],
            rig[f"tail_{index}"],
            smooth=True,
            vertex_color_fn=tail_color,
        )

    finish_character(
        rig,
        silhouette_features=(
            "continuous-feline-loft rounded-ears cheek-pads four-digitigrade-limbs "
            "articulated-paws vertex-color-stripes shoulder-blade-three-feather-layers"
        ),
        triangle_range=(24_000, 30_000),
    )
    return rig["root"]


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
    "ember-phoenix": build_phoenix,
    "storm-white-tiger": build_white_tiger,
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
