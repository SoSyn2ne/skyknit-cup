"""Build the project-authored M39 volcanic archipelago source and GLBs.

Run with Blender 4.5 LTS:
blender --background --python tools/blender/build_volcanic_archipelago.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_world_art as world  # noqa: E402


ROOT = SCRIPT_DIR.parents[1]
BLEND_PATH = (
    ROOT / "assets" / "source" / "world" / "skyknit-volcanic-archipelago.blend"
)
ASSET_VERSION = "0.9"
TAU = math.tau


def _mark_semantic(obj: bpy.types.Object, name: str) -> bpy.types.Object:
    obj["semantic"] = name
    obj["asset_version"] = ASSET_VERSION
    obj["geometry_style"] = world.GEOMETRY_STYLE
    return obj


def _join(
    parts: list[bpy.types.Object],
    name: str,
    tag: str,
    root: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    joined = world.join_parts(parts, name, tag, root)
    # The one-material semantic mesh keeps the runtime primitive budget stable.
    # Per-vertex colors authored before the join preserve lava/cooling/stone accents.
    world.collapse_neutral_material_slots(joined, material)
    return _mark_semantic(joined, name)


def _finish_mesh(
    name: str,
    location: tuple[float, float, float],
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    return world.finish_object(obj, name, material, collection, root)


def _ring_wobble(angle: float, seed: float, strength: float) -> float:
    return 1.0 + strength * (
        math.sin(angle * 3.0 + seed) * 0.62
        + math.cos(angle * 7.0 - seed * 0.43) * 0.25
        + math.sin(angle * 11.0 + seed * 0.71) * 0.13
    )


def _add_radial_shell(
    name: str,
    location: tuple[float, float, float],
    rings: list[tuple[float, float, float, float]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    seed: float,
    cap_bottom: bool = True,
    cap_top: bool = True,
    south_notch_depth: float = 0.0,
) -> bpy.types.Object:
    """Create a faceted radial shell without the egg-like volume of an ico sphere.

    Rings are ``(z, radius_x, radius_y, irregularity)`` in object-local space.
    """

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for ring_index, (z, radius_x, radius_y, irregularity) in enumerate(rings):
        ring_seed = seed + ring_index * 1.371
        for index in range(segments):
            angle = index / segments * TAU
            wobble = _ring_wobble(angle, ring_seed, irregularity)
            z_offset = 0.0
            if south_notch_depth > 0.0 and ring_index >= 4:
                # Break roughly 90 degrees of the south rim so the landing and
                # mission approach reveal the sun-heart instead of a solid wall.
                southness = max(0.0, -math.sin(angle))
                notch = max(0.0, (southness - 0.34) / 0.66) ** 1.7
                ring_weight = (0.38, 0.88, 0.76, 0.62)[
                    min(ring_index - 4, 3)
                ]
                z_offset = -south_notch_depth * notch * ring_weight
            # A restrained offset keeps broad facets from reading as a lathed vase.
            offset = math.sin(ring_seed * 1.91) * irregularity * 0.7
            vertices.append(
                (
                    math.cos(angle) * radius_x * wobble + offset,
                    math.sin(angle) * radius_y * wobble - offset * 0.45,
                    z + z_offset,
                )
            )

    for ring_index in range(len(rings) - 1):
        current = ring_index * segments
        following = current + segments
        for index in range(segments):
            next_index = (index + 1) % segments
            face = (
                current + index,
                current + next_index,
                following + next_index,
                following + index,
            )
            faces.append(face)

    if cap_bottom:
        center = len(vertices)
        vertices.append((0.0, 0.0, rings[0][0]))
        for index in range(segments):
            faces.append((center, (index + 1) % segments, index))
    if cap_top:
        center = len(vertices)
        vertices.append((0.0, 0.0, rings[-1][0]))
        top = (len(rings) - 1) * segments
        for index in range(segments):
            faces.append((center, top + index, top + (index + 1) % segments))

    return _finish_mesh(
        name, location, vertices, faces, material, collection, root
    )


def _add_broken_strata_band(
    name: str,
    location: tuple[float, float, float],
    contours: list[tuple[float, float, float, float]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    seed: float,
    south_opening: float = 0.48,
    reverse_winding: bool = False,
) -> bpy.types.Object:
    """Create an open, layered cliff band that preserves the south approach.

    The stepped contours make real ledges and inner wall breaks. Faces across
    the southern aperture are deliberately omitted instead of hidden below the
    terrain, keeping the caldera throat readable with front-face rendering.
    """

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for contour_index, (z, radius_x, radius_y, irregularity) in enumerate(contours):
        contour_seed = seed + contour_index * 1.913
        for index in range(segments):
            angle = index / segments * TAU
            wobble = _ring_wobble(angle, contour_seed, irregularity)
            vertices.append(
                (
                    math.cos(angle) * radius_x * wobble,
                    math.sin(angle) * radius_y * wobble,
                    z,
                )
            )

    for contour_index in range(len(contours) - 1):
        current = contour_index * segments
        following = current + segments
        for index in range(segments):
            next_index = (index + 1) % segments
            midpoint = (index + 0.5) / segments * TAU
            if -math.sin(midpoint) > south_opening:
                continue
            face = (
                current + index,
                current + next_index,
                following + next_index,
                following + index,
            )
            faces.append(tuple(reversed(face)) if reverse_winding else face)

    return _finish_mesh(
        name, location, vertices, faces, material, collection, root
    )


def _add_polygon_slab(
    name: str,
    location: tuple[float, float, float],
    radius_x: float,
    radius_y: float,
    half_height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    points: int,
    seed: float,
    rotation_z: float = 0.0,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    plan: list[tuple[float, float]] = []
    for index in range(points):
        angle = index / points * TAU
        wobble = _ring_wobble(angle, seed, 0.075)
        plan.append(
            (math.cos(angle) * radius_x * wobble, math.sin(angle) * radius_y * wobble)
        )
    for z in (-half_height, half_height):
        vertices.extend((x, y, z) for x, y in plan)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(points))),
        tuple(points + index for index in range(points)),
    ]
    for index in range(points):
        next_index = (index + 1) % points
        faces.append((index, next_index, points + next_index, points + index))
    return _finish_mesh(
        name,
        location,
        vertices,
        faces,
        material,
        collection,
        root,
        rotation=(0.0, 0.0, rotation_z),
    )


def _add_bridge_slab(
    name: str,
    location: tuple[float, float, float],
    half_width: float,
    half_length: float,
    half_height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    rotation_z: float,
    fracture: float,
) -> bpy.types.Object:
    """Create an angular causeway deck with a bridge-like rectangular plan."""

    plan = [
        (-half_width * (1.0 - fracture), -half_length),
        (half_width, -half_length * (1.0 - fracture * 0.45)),
        (half_width * (0.88 + fracture * 0.16), half_length),
        (-half_width, half_length * (0.92 - fracture * 0.18)),
    ]
    vertices = [
        (x, y, z)
        for z in (-half_height, half_height)
        for x, y in plan
    ]
    faces = [
        (3, 2, 1, 0),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    return _finish_mesh(
        name,
        location,
        vertices,
        faces,
        material,
        collection,
        root,
        rotation=(0.0, 0.0, rotation_z),
    )


def _add_crown_tooth(
    name: str,
    location: tuple[float, float, float],
    angle: float,
    width: float,
    depth: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> bpy.types.Object:
    half_w = width * 0.5
    half_d = depth * 0.5
    vertices = [
        (-half_d, -half_w, 0.0),
        (half_d, -half_w, 0.0),
        (half_d, half_w, 0.0),
        (-half_d, half_w, 0.0),
        (-half_d * 0.35, 0.0, height),
        (half_d * 0.20, 0.0, height * 0.82),
    ]
    faces = [
        (0, 3, 2, 1),
        (0, 1, 5, 4),
        (1, 2, 5),
        (2, 3, 4, 5),
        (3, 0, 4),
    ]
    return _finish_mesh(
        name,
        location,
        vertices,
        faces,
        material,
        collection,
        root,
        rotation=(0.0, 0.0, angle),
    )


def _add_lava_pool(
    name: str,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    segments: int,
    ring_radii: tuple[float, ...],
) -> bpy.types.Object:
    if len(ring_radii) < 2 or ring_radii[0] != 0.0:
        raise ValueError("lava pool rings must start at the center")
    vertices: list[tuple[float, float, float]] = [(0.0, 0.0, 0.04)]
    for ring_index, radius in enumerate(ring_radii[1:], start=1):
        for index in range(segments):
            angle = index / segments * TAU
            wobble = _ring_wobble(angle, 10.0 + ring_index * 2.7, 0.035)
            z = math.sin(angle * 3.0 + ring_index) * 0.06
            vertices.append(
                (math.cos(angle) * radius * wobble, math.sin(angle) * radius * wobble, z)
            )
    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + (index + 1) % segments))
    for ring_index in range(1, len(ring_radii) - 1):
        inner = 1 + (ring_index - 1) * segments
        outer = inner + segments
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append(
                (
                    inner + index,
                    outer + index,
                    outer + next_index,
                    inner + next_index,
                )
            )
    return _finish_mesh(
        name, location, vertices, faces, material, collection, root
    )


def _interpolate_polyline(
    points: list[tuple[float, float, float]], subdivisions: int
) -> list[tuple[float, float, float]]:
    result: list[tuple[float, float, float]] = []
    for start, end in zip(points, points[1:]):
        for step in range(subdivisions):
            t = step / subdivisions
            result.append(
                tuple(start[axis] + (end[axis] - start[axis]) * t for axis in range(3))
            )
    result.append(points[-1])
    return result


def _add_lava_channel(
    name: str,
    points: list[tuple[float, float, float]],
    width: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    subdivisions: int,
) -> bpy.types.Object:
    sampled = _interpolate_polyline(points, subdivisions)
    vertices: list[tuple[float, float, float]] = []
    for index, point in enumerate(sampled):
        previous = sampled[max(0, index - 1)]
        following = sampled[min(len(sampled) - 1, index + 1)]
        dx = following[0] - previous[0]
        dy = following[1] - previous[1]
        length = max(1e-5, math.hypot(dx, dy))
        px, py = -dy / length, dx / length
        taper = 1.0 - index / max(1, len(sampled) - 1) * 0.42
        ripple = math.sin(index * 1.73) * width * 0.10
        half_width = width * taper * 0.5
        vertices.extend(
            [
                (point[0] + px * (half_width + ripple), point[1] + py * (half_width + ripple), point[2]),
                (point[0] - px * (half_width - ripple), point[1] - py * (half_width - ripple), point[2]),
            ]
        )
    faces = [
        (index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2)
        for index in range(len(sampled) - 1)
    ]
    return _finish_mesh(
        name, (0.0, 0.0, 0.0), vertices, faces, material, collection, root
    )


def _build_materials() -> dict[str, bpy.types.Material]:
    return {
        "obsidian": world.make_material(
            "M_Volcanic_Obsidian", (0.073, 0.095, 0.16, 1.0), 0.29, 0.46,
            surface="terrain", cap_color=(0.15, 0.13, 0.19),
        ),
        "basalt": world.make_material(
            "M_Volcanic_Basalt", (0.085, 0.048, 0.064, 1.0), 0.84, 0.08,
            surface="terrain", cap_color=(0.19, 0.105, 0.095),
        ),
        "ruin": world.make_material(
            "M_Volcanic_Ruin", (0.30, 0.37, 0.40, 1.0), 0.74, 0.08,
            surface="stone", cap_color=(0.43, 0.48, 0.43),
        ),
        "cooling": world.make_material(
            "M_Volcanic_Cooling", (0.025, 0.94, 0.84, 1.0), 0.20, 0.12, 1.65
        ),
        "lava": world.make_material(
            # The runtime shader multiplies this vertex color into its animated
            # flow, so retain warm channels instead of crushing them to flat red.
            "M_Volcanic_Lava", (1.0, 0.72, 0.20, 1.0), 0.28, 0.02, 2.8
        ),
        "ember": world.make_material(
            "M_Volcanic_Ember", (1.0, 0.48, 0.055, 1.0), 0.28, 0.05, 1.25
        ),
    }


def _build_caldera(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    high = lod == "high"
    segments = 96 if high else 40
    # A single hollow mountain shell creates the deliberate crown silhouette and
    # leaves a real aperture for the sun-heart instead of filling it with blobs.
    caldera_parts: list[bpy.types.Object] = [
        _add_radial_shell(
            f"CalderaCrownShell_{tag}",
            (0.0, 4.0, -8.0),
            [
                (-14.0, 13.0, 11.0, 0.07),
                (-11.0, 19.0, 16.0, 0.085),
                (-8.0, 25.0, 21.5, 0.08),
                (-3.0, 32.0, 27.0, 0.08),
                (0.0, 35.0, 30.0, 0.075),
                (8.0, 37.0, 31.5, 0.065),
                (13.0, 34.5, 29.5, 0.07),
                (17.0, 31.0, 26.5, 0.075),
                (21.5, 27.0, 23.0, 0.08),
                (25.0, 22.0, 18.8, 0.09),
                (29.0, 15.5, 13.6, 0.055),
                (27.5, 12.0, 10.6, 0.035),
            ],
            materials["basalt"],
            collection,
            root,
            segments,
            seed=39.0,
            cap_bottom=True,
            cap_top=False,
            south_notch_depth=10.0,
        )
    ]

    # Thin, offset cliff collars break the large exterior into readable strata.
    # They use real ledge geometry and preserve the same open southern aperture.
    strata_specs = (
        (
            (-9.8, 24.2, 20.8, 0.06),
            (-8.8, 27.0, 23.1, 0.055),
            (-7.7, 27.4, 23.4, 0.05),
            (-6.8, 25.8, 22.0, 0.055),
        ),
        (
            (-3.2, 33.0, 28.1, 0.055),
            (-2.0, 36.6, 31.0, 0.05),
            (-0.8, 37.2, 31.4, 0.05),
            (0.2, 35.5, 30.2, 0.055),
        ),
        (
            (4.0, 35.8, 30.5, 0.05),
            (5.2, 38.2, 32.3, 0.045),
            (6.5, 38.0, 32.0, 0.045),
            (7.6, 36.6, 31.0, 0.05),
        ),
        (
            (11.0, 33.2, 28.3, 0.055),
            (12.2, 35.5, 30.0, 0.05),
            (13.5, 35.0, 29.6, 0.05),
            (14.6, 33.4, 28.3, 0.055),
        ),
        (
            (17.2, 29.8, 25.5, 0.06),
            (18.3, 31.8, 27.0, 0.055),
            (19.4, 31.0, 26.4, 0.055),
            (20.5, 29.0, 24.8, 0.06),
        ),
    )
    active_strata = strata_specs if high else (strata_specs[1], strata_specs[3])
    for index, contours in enumerate(active_strata):
        caldera_parts.append(
            _add_broken_strata_band(
                f"CalderaStrata_{index}_{tag}",
                (0.0, 4.0, -8.0),
                list(contours),
                materials["obsidian"] if index % 2 else materials["basalt"],
                collection,
                root,
                96 if high else 40,
                seed=140.0 + index * 4.7,
            )
        )

    # A separately wound inner wall remains visible from the crater and turns
    # the lava bowl into a true hollow landmark under FrontSide rendering.
    caldera_parts.append(
        _add_broken_strata_band(
            f"CalderaInnerWall_{tag}",
            (0.0, 4.0, 0.0),
            [
                (19.15, 11.0, 9.8, 0.035),
                (19.8, 11.8, 10.5, 0.04),
                (20.7, 13.0, 11.4, 0.045),
                (21.8, 14.7, 12.8, 0.05),
                (23.0, 16.2, 14.1, 0.055),
                (24.2, 18.0, 15.6, 0.06),
                (25.2, 19.3, 16.7, 0.055),
            ],
            materials["obsidian"],
            collection,
            root,
            112 if high else 48,
            seed=187.0,
            south_opening=0.42,
            reverse_winding=True,
        )
    )

    tooth_count = 30 if high else 12
    for index in range(tooth_count):
        angle = index / tooth_count * TAU + 0.035 * math.sin(index * 2.1)
        if math.sin(angle) < -0.52:
            continue
        radius_x = 19.5 + (index % 3) * 1.2
        radius_y = 17.2 + (index % 4) * 0.7
        caldera_parts.append(
            _add_crown_tooth(
                f"CalderaCrownTooth_{index}_{tag}",
                (
                    math.cos(angle) * radius_x,
                    4.0 + math.sin(angle) * radius_y,
                    18.5 + math.sin(index * 1.73) * 1.4,
                ),
                angle,
                3.4 + (index % 3) * 0.55,
                6.8 + (index % 2) * 1.2,
                4.8 + (index % 5) * 0.92,
                materials["obsidian"],
                collection,
                root,
            )
        )
    caldera = _join(
        caldera_parts, "VolcanoCaldera", tag, root, materials["basalt"]
    )
    caldera["silhouette"] = "hollow-obsidian-crown"

    lava_parts: list[bpy.types.Object] = [
        _add_lava_pool(
            f"LavaHeart_{tag}",
            (0.0, 4.0, 19.2),
            materials["lava"],
            collection,
            root,
            128 if high else 44,
            (0.0, 2.4, 4.8, 7.2, 9.6, 10.8),
        )
    ]
    channel_specs = (
        [(-4.5, -5.0, 19.25), (-7.0, -13.0, 18.2), (-13.0, -23.0, 10.4), (-10.0, -31.0, 2.0)],
        [(9.0, 5.5, 19.2), (16.0, 2.0, 18.8), (24.0, -2.0, 14.0), (31.0, -4.0, 6.8)],
        [(5.2, 13.0, 19.2), (11.0, 19.0, 18.5), (18.0, 26.0, 11.8), (22.0, 33.0, 2.4)],
    )
    for index, points in enumerate(channel_specs):
        lava_parts.append(
            _add_lava_channel(
                f"LavaChannel_{index}_{tag}",
                points,
                4.8 if index == 0 else 3.8,
                materials["lava"],
                collection,
                root,
                subdivisions=10 if high else 4,
            )
        )
    lava = _join(lava_parts, "LavaSurface", tag, root, materials["lava"])
    lava["lava_parts"] = "sun-heart,three-slope-channels"


def _build_islands(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    island_specs = [
        (-58.0, 24.0, -2.0, 20.0, 15.0, 10.0, -0.12),
        (-44.0, -39.0, 5.0, 17.0, 13.0, 9.0, 0.14),
        (44.0, -34.0, 3.0, 22.0, 16.0, 11.0, -0.10),
        (62.0, 18.0, 7.0, 18.0, 14.0, 10.0, 0.17),
        (28.0, 56.0, 3.0, 21.0, 15.0, 10.0, -0.08),
        (-29.0, 61.0, 8.0, 17.0, 12.0, 8.0, 0.12),
        (-78.0, -18.0, 13.0, 14.0, 10.0, 8.0, -0.20),
        (79.0, -14.0, 16.0, 15.0, 11.0, 8.0, 0.18),
    ]
    parts: list[bpy.types.Object] = []
    high = lod == "high"
    segments = 80 if high else 24
    plateau_points = 24 if high else 14
    for index, (x, y, z, sx, sy, depth, rotation) in enumerate(island_specs):
        # The wide upper ledge and narrow underside make each island read as a
        # carved floating shelf, never as a stretched sphere.
        parts.append(
            _add_radial_shell(
                f"ObsidianShelf_{index}_{tag}",
                (x, y, z),
                [
                    (-depth * 1.25, sx * 0.10, sy * 0.10, 0.11),
                    (-depth * 1.02, sx * 0.22, sy * 0.20, 0.105),
                    (-depth * 0.78, sx * 0.38, sy * 0.36, 0.10),
                    (-depth * 0.56, sx * 0.52, sy * 0.49, 0.095),
                    (-depth * 0.34, sx * 0.68, sy * 0.64, 0.085),
                    (-depth * 0.16, sx * 0.84, sy * 0.80, 0.08),
                    (-1.2, sx, sy, 0.07),
                    (1.1, sx * 0.98, sy * 0.97, 0.045),
                    (3.4, sx * 0.76, sy * 0.73, 0.035),
                ],
                materials["obsidian"],
                collection,
                root,
                segments,
                seed=71.0 + index * 3.7,
                cap_bottom=True,
                cap_top=True,
            )
        )
        parts[-1].rotation_euler.z = rotation
        parts.append(
            _add_polygon_slab(
                f"BasaltPlateau_{index}_{tag}",
                (x, y, z + 3.52),
                sx * 0.68,
                sy * 0.65,
                0.34,
                materials["basalt"],
                collection,
                root,
                plateau_points,
                93.0 + index,
                rotation_z=rotation,
            )
        )
        if high and index in (0, 2, 4, 6):
            # A thin, offset side shelf catches light as a genuine cliff ledge.
            parts.append(
                _add_polygon_slab(
                    f"IslandCliffLedge_{index}_{tag}",
                    (x, y, z - depth * 0.30),
                    sx * 0.73,
                    sy * 0.69,
                    0.26,
                    materials["basalt"],
                    collection,
                    root,
                    36,
                    seed=220.0 + index,
                    rotation_z=rotation,
                )
            )
        shard_count = 2 if high else 0
        for shard in range(shard_count):
            angle = rotation + 0.55 + index * 0.33 + shard * 2.2
            parts.append(
                _add_crown_tooth(
                    f"IslandShard_{index}_{shard}_{tag}",
                    (
                        x + math.cos(angle) * sx * (0.54 + shard * 0.06),
                        y + math.sin(angle) * sy * (0.50 + shard * 0.05),
                        z + 3.65,
                    ),
                    angle,
                    2.0 + shard * 0.35,
                    3.6 + shard * 0.45,
                    4.6 + (index + shard) % 4,
                    materials["obsidian"],
                    collection,
                    root,
                )
            )
    islands = _join(parts, "ObsidianIslands", tag, root, materials["obsidian"])
    islands["silhouette"] = "faceted-shelves-tapered-undersides"


def _build_landing_and_ruins(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    high = lod == "high"
    slab_points = 28 if high else 12
    landing_parts = [
        _add_polygon_slab(
            f"LandingShelf_{tag}",
            (0.0, -72.0, -5.0),
            18.0,
            14.0,
            2.4,
            materials["basalt"],
            collection,
            root,
            slab_points,
            seed=18.0,
        ),
        world.add_torus(
            f"LandingRune_{tag}",
            (0.0, -72.0, -2.48),
            7.2,
            0.46,
            materials["cooling"],
            collection,
            root,
            48 if high else 24,
            7 if high else 4,
        ),
        world.add_torus(
            f"LandingOuterCircuit_{tag}",
            (0.0, -72.0, -2.44),
            11.4,
            0.22,
            materials["cooling"],
            collection,
            root,
            56 if high else 20,
            6 if high else 4,
        ),
    ]
    landing = _join(landing_parts, "LandingPad", tag, root, materials["basalt"])
    landing["landing_profile"] = "southern-shelf"

    ruin_parts: list[bpy.types.Object] = []
    # The first part preserves the M39 semantic origin contract.
    column_specs = (
        (-39.0, 38.0, 15.5, 15.0, 2.8),
        (-30.0, 44.0, 13.5, 11.0, 2.5),
        (38.0, 36.0, 16.5, 17.0, 3.0),
        (47.0, 43.0, 14.0, 12.0, 2.5),
        (-33.0, -24.0, 9.5, 12.0, 2.4),
        (34.0, -20.0, 10.5, 13.0, 2.5),
    )
    for index, (x, y, z, height, radius) in enumerate(column_specs):
        ruin_parts.append(
            world.add_flared_column(
                f"CoolingPylon_{index}_{tag}",
                (x, y, z),
                radius,
                height,
                materials["ruin"],
                collection,
                root,
                24 if high else 10,
                seed=110.0 + index,
                top_scale=0.64,
            )
        )
        ruin_parts.append(
            world.add_torus(
                f"CoolingHalo_{index}_{tag}",
                (x, y, z + height * 0.36),
                radius * 0.78,
                0.28,
                materials["cooling"],
                collection,
                root,
                36 if high else 14,
                6 if high else 4,
                rotation=(math.pi / 2.0, 0.0, 0.0),
            )
        )
        collar_specs = (
            (z - height * 0.48, radius * 1.38, radius * 1.26, 0.42),
            (z + height * 0.44, radius * 1.04, radius * 0.96, 0.32),
        )
        for collar_index, (collar_z, radius_x, radius_y, half_height) in enumerate(
            collar_specs if high else collar_specs[:1]
        ):
            ruin_parts.append(
                world.add_handcut_slab(
                    f"CoolingPylonCollar_{index}_{collar_index}_{tag}",
                    (x, y, collar_z),
                    (radius_x, radius_y, half_height),
                    materials["ruin"],
                    collection,
                    root,
                    18 if high else 10,
                    seed=260.0 + index * 3.0 + collar_index,
                    rotation=(0.0, 0.0, (index % 3 - 1) * 0.12),
                )
            )
        if high:
            for fin_index in range(3):
                fin_angle = fin_index / 3.0 * TAU + index * 0.37
                ruin_parts.append(
                    _add_crown_tooth(
                        f"CoolingPylonFin_{index}_{fin_index}_{tag}",
                        (
                            x + math.cos(fin_angle) * radius * 0.88,
                            y + math.sin(fin_angle) * radius * 0.82,
                            z + height * 0.20,
                        ),
                        fin_angle,
                        0.85,
                        1.45,
                        2.8 + (index + fin_index) % 2,
                        materials["ruin"],
                        collection,
                        root,
                    )
                )
    for index, (x, y, rotation) in enumerate(((-34.5, -24.0, 0.0), (36.5, -20.0, 0.0))):
        ruin_parts.append(
            world.add_arch_band(
                f"CoolingArch_{index}_{tag}",
                (x, y, 9.0),
                7.0,
                4.8,
                1.0,
                materials["ruin"],
                collection,
                root,
                30 if high else 14,
                rotation=(math.pi / 2.0, rotation, 0.0),
            )
        )
        if high:
            ruin_parts.append(
                _add_polygon_slab(
                    f"CoolingArchKeystone_{index}_{tag}",
                    (x, y, 15.6),
                    1.35,
                    0.78,
                    0.58,
                    materials["ruin"],
                    collection,
                    root,
                    12,
                    seed=310.0 + index,
                    rotation_z=rotation,
                )
            )
    ruins = _join(ruin_parts, "CoolingRuins", tag, root, materials["ruin"])
    ruins["accent_profile"] = "six-teal-halos-two-broken-arches"

    bridge_parts: list[bpy.types.Object] = [
        # A remote fragment keeps the historic semantic anchor while the readable
        # causeway now begins at the southern landing shelf.
        _add_polygon_slab(
            f"BridgeOriginFragment_{tag}",
            (-47.0, 4.0, 14.0),
            4.6,
            3.0,
            0.65,
            materials["ruin"],
            collection,
            root,
            9 if high else 7,
            seed=40.0,
            rotation_z=-0.17,
        )
    ]
    causeway_specs = (
        (-9.5, -56.5, -1.0, -0.05),
        (-9.0, -49.8, 0.1, 0.04),
        (-7.8, -42.4, 1.5, -0.06),
        (-6.0, -34.2, 3.4, 0.08),
        (-3.5, -25.6, 5.8, -0.08),
    )
    for index, (x, y, z, rotation) in enumerate(causeway_specs):
        bridge_parts.append(
            _add_bridge_slab(
                f"SouthCausewaySlab_{index}_{tag}",
                (x, y, z),
                2.45 - index * 0.06,
                3.35 + index * 0.08,
                0.58,
                materials["ruin"],
                collection,
                root,
                rotation_z=rotation,
                fracture=0.08 + index * 0.035,
            )
        )
    # Broken side rails turn the stepping sequence into a recognizable ruined
    # causeway while keeping the central flight lane open.
    for rail_index, (start_index, end_index) in enumerate(((0, 1), (2, 3), (3, 4))):
        start = causeway_specs[start_index]
        end = causeway_specs[end_index]
        side = -1.0 if rail_index % 2 == 0 else 1.0
        bridge_parts.append(
            world.add_segment(
                f"CausewayRail_{rail_index}_{tag}",
                (start[0] + side * 2.25, start[1], start[2] + 1.55),
                (end[0] + side * 2.10, end[1], end[2] + 1.55),
                0.24,
                materials["ruin"],
                collection,
                root,
                10 if high else 6,
            )
        )

    # Repeated transverse ribs and paired posts give the route a recognizable
    # ruined bridge profile without closing the central flight corridor.
    rib_indices = range(len(causeway_specs) - 1) if high else (0, 2)
    for rib_index in rib_indices:
        start = causeway_specs[rib_index]
        end = causeway_specs[rib_index + 1]
        bridge_parts.append(
            world.add_arch_band(
                f"CausewayRib_{rib_index}_{tag}",
                (
                    (start[0] + end[0]) * 0.5,
                    (start[1] + end[1]) * 0.5,
                    (start[2] + end[2]) * 0.5 - 0.55,
                ),
                2.30,
                1.55,
                0.32,
                materials["ruin"],
                collection,
                root,
                14 if high else 8,
            )
        )
    post_indices = range(len(causeway_specs)) if high else (0, 4)
    for post_index in post_indices:
        x, y, z, _ = causeway_specs[post_index]
        for side in (-1.0, 1.0):
            bridge_parts.append(
                world.add_segment(
                    f"CausewayPost_{post_index}_{int(side)}_{tag}",
                    (x + side * 2.12, y, z + 0.5),
                    (x + side * 2.02, y, z + 2.35),
                    0.22,
                    materials["ruin"],
                    collection,
                    root,
                    10 if high else 6,
                )
            )
    if high:
        for brace_index in range(len(causeway_specs) - 1):
            start = causeway_specs[brace_index]
            end = causeway_specs[brace_index + 1]
            side = -1.0 if brace_index % 2 else 1.0
            bridge_parts.append(
                world.add_segment(
                    f"CausewayBrace_{brace_index}_{tag}",
                    (start[0] + side * 2.0, start[1], start[2] + 0.8),
                    (end[0] + side * 2.0, end[1], end[2] + 2.0),
                    0.16,
                    materials["ruin"],
                    collection,
                    root,
                    8,
                )
            )
    bridge = _join(bridge_parts, "BrokenBridge", tag, root, materials["ruin"])
    bridge["route"] = "southern-landing-to-caldera"


def _build_mission_landmarks(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    high = lod == "high"
    seal_positions = [(-55.0, 23.0, 17.0), (44.0, -34.0, 16.0), (28.0, 55.0, 17.0)]
    for index, position in enumerate(seal_positions, start=1):
        parts = [
            world.add_torus(
                f"SealRing_{index}_{tag}",
                position,
                5.6,
                0.68,
                materials["cooling"],
                collection,
                root,
                48 if high else 24,
                7 if high else 4,
                rotation=(math.pi / 2.0, 0.0, 0.0),
            ),
            world.add_segment(
                f"SealSpine_{index}_{tag}",
                (position[0], position[1], position[2] - 6.0),
                (position[0], position[1], position[2] + 6.0),
                0.58,
                materials["ruin"],
                collection,
                root,
                16 if high else 8,
            ),
            world.add_torus(
                f"SealInnerCircuit_{index}_{tag}",
                position,
                3.65,
                0.26,
                materials["cooling"],
                collection,
                root,
                32 if high else 16,
                5 if high else 4,
                rotation=(math.pi / 2.0, 0.0, 0.0),
            ),
        ]
        fin_count = 4 if high else 2
        for fin_index in range(fin_count):
            fin_angle = fin_index / fin_count * TAU
            parts.append(
                _add_crown_tooth(
                    f"SealFin_{index}_{fin_index}_{tag}",
                    (
                        position[0] + math.cos(fin_angle) * 5.45,
                        position[1],
                        position[2] + math.sin(fin_angle) * 5.45,
                    ),
                    0.0,
                    0.68,
                    1.1,
                    1.65,
                    materials["ruin"],
                    collection,
                    root,
                )
            )
        seal = _join(parts, f"CoolingSeal_{index}", tag, root, materials["cooling"])
        seal["mission_stage"] = index

    escape = world.add_arch_band(
        f"EscapeGate__{tag}",
        (0.0, 82.0, 25.0),
        11.0,
        8.2,
        1.25,
        materials["ember"],
        collection,
        root,
        40 if high else 20,
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    _mark_semantic(escape, "EscapeGate")

    beacon_parts = [
        # This semantic origin maps through the runtime region transform to
        # world (-240, 34, -720), exactly matching the challenge hotspot.
        _add_crown_tooth(
            f"BeaconOriginAnchor_{tag}",
            (0.0, -100.0, 6.0),
            0.0,
            0.025,
            0.025,
            0.035,
            materials["cooling"],
            collection,
            root,
        ),
        world.add_arch_band(
            f"BeaconArch_{tag}",
            (0.0, -100.0, 6.0),
            3.9,
            2.85,
            0.95,
            materials["ruin"],
            collection,
            root,
            34 if high else 18,
            rotation=(0.0, 0.0, 0.0),
        ),
        world.add_torus(
            f"BeaconCore_{tag}",
            (0.0, -100.0, 6.0),
            1.75,
            0.38,
            materials["cooling"],
            collection,
            root,
            36 if high else 18,
            6 if high else 4,
            rotation=(math.pi / 2.0, 0.0, 0.0),
        ),
    ]
    for pylon_index, x in enumerate((-4.25, 4.25)):
        beacon_parts.append(
            world.add_flared_column(
                f"BeaconPylon_{pylon_index}_{tag}",
                (x, -100.0, 3.15),
                0.72,
                6.1,
                materials["ruin"],
                collection,
                root,
                16 if high else 8,
                seed=380.0 + pylon_index,
                top_scale=0.72,
            )
        )
        if high:
            beacon_parts.append(
                _add_polygon_slab(
                    f"BeaconPylonFoot_{pylon_index}_{tag}",
                    (x, -100.0, 0.18),
                    1.18,
                    0.92,
                    0.22,
                    materials["ruin"],
                    collection,
                    root,
                    12,
                    seed=390.0 + pylon_index,
                )
            )
    beacon = _join(
        beacon_parts, "ExpeditionBeacon", tag, root, materials["cooling"]
    )
    beacon["landmark"] = "southern-cooling-arch"

    for index, position in enumerate([(-56.0, -5.0, 20.0), (48.0, 8.0, 22.0), (4.0, 49.0, 26.0)], start=1):
        world.add_semantic_empty(f"Thermal_{index}", tag, position, collection, root)
    for index, position in enumerate([(-27.0, -23.0, 42.0), (31.0, 22.0, 45.0), (2.0, 61.0, 48.0)], start=1):
        world.add_semantic_empty(f"RockSpawner_{index}", tag, position, collection, root)
    world.add_semantic_empty("LavaWaveOrigin", tag, (0.0, 4.0, 19.5), collection, root)


def build_volcanic_archipelago(
    lod: str, materials: dict[str, bpy.types.Material]
) -> tuple[bpy.types.Collection, bpy.types.Object]:
    collection = world.make_collection(f"M39_VOLCANIC_ARCHIPELAGO_{lod.upper()}")
    root, tag = world.create_asset_root("volcanic-archipelago", lod, collection)
    root["asset_version"] = ASSET_VERSION
    root["story_chapter"] = "heart-of-the-sun"
    root["runtime_lava_material"] = "LavaSurface"
    root["art_direction"] = "obsidian-crown-around-glowing-sun-heart"

    _build_caldera(lod, materials, collection, root, tag)
    _build_islands(lod, materials, collection, root, tag)
    _build_landing_and_ruins(lod, materials, collection, root, tag)
    _build_mission_landmarks(lod, materials, collection, root, tag)
    return collection, root


def main() -> None:
    world.clear_file()
    materials = _build_materials()
    assets: list[tuple[str, bpy.types.Object]] = []
    for lod in ("high", "low"):
        _, asset_root = build_volcanic_archipelago(lod, materials)
        assets.append((lod, asset_root))

    for lod, asset_root in assets:
        world.export_asset("volcanic-archipelago", lod, asset_root)

    fingerprint = world.semantic_scene_fingerprint()
    bpy.context.scene["semantic_fingerprint"] = fingerprint
    bpy.context.scene["asset_version"] = ASSET_VERSION
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    staging_path = BLEND_PATH.with_name(f".{BLEND_PATH.stem}-staging.blend")
    try:
        bpy.ops.wm.save_as_mainfile(filepath=str(staging_path))
        existing_fingerprint = None
        if BLEND_PATH.exists():
            bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH), load_ui=False)
            existing_fingerprint = bpy.context.scene.get("semantic_fingerprint")
        if existing_fingerprint == fingerprint:
            staging_path.unlink(missing_ok=True)
            print(f"VOLCANIC_BLEND_UNCHANGED={BLEND_PATH}")
        else:
            staging_path.replace(BLEND_PATH)
            print(f"VOLCANIC_BLEND_UPDATED={BLEND_PATH}")
    finally:
        staging_path.unlink(missing_ok=True)
    print(f"VOLCANIC_BLEND={BLEND_PATH}")


if __name__ == "__main__":
    main()
