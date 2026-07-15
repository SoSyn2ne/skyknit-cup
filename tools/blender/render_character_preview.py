"""Render a reproducible studio preview of a character source blend.

This is an authoring QA helper, not a runtime asset dependency.  It leaves the
source blend untouched and writes only the requested PNG.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--azimuth", type=float, default=35.0)
    return parser.parse_args(arguments)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def mesh_bounds(root: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ vertex.co
        for obj in (root, *root.children_recursive)
        if obj.type == "MESH"
        for vertex in obj.data.vertices
    ]
    if not points:
        raise RuntimeError("Preview source has no mesh vertices")
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
    target: Vector,
) -> None:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    look_at(light, target)


def render_preview(source: Path, output: Path, azimuth: float) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root = bpy.data.objects.get("DragonRoot")
    if root is None:
        roots = [obj for obj in bpy.data.objects if obj.parent is None and obj.type == "EMPTY"]
        if len(roots) != 1:
            raise RuntimeError("Preview source has no unambiguous asset root")
        root = roots[0]
    minimum, maximum = mesh_bounds(root)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    radius = max(size.x, size.y, size.z)

    camera_data = bpy.data.cameras.new("M37_PreviewCamera")
    camera_data.lens = 56.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("M37_PreviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    angle = math.radians(azimuth)
    distance = radius * 1.18
    camera.location = (
        center.x + math.sin(angle) * distance,
        center.y + math.cos(angle) * distance,
        center.z + radius * 0.42,
    )
    look_at(camera, center)
    bpy.context.scene.camera = camera

    add_area_light(
        "M37_Key",
        (center.x + radius * 0.7, center.y + radius * 0.7, maximum.z + radius * 0.8),
        1_450.0,
        radius * 0.75,
        (1.0, 0.73, 0.48),
        center,
    )
    add_area_light(
        "M37_Fill",
        (center.x - radius * 0.9, center.y - radius * 0.2, center.z + radius * 0.25),
        960.0,
        radius * 0.9,
        (0.38, 0.72, 1.0),
        center,
    )
    add_area_light(
        "M37_Rim",
        (center.x, center.y - radius, maximum.z + radius * 0.55),
        1_180.0,
        radius * 0.6,
        (0.42, 1.0, 0.86),
        center,
    )

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = scene.world or bpy.data.worlds.new("M37_PreviewWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.018, 0.055, 0.070, 1.0)
        background.inputs["Strength"].default_value = 0.42
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"CHARACTER_PREVIEW={output}")


def main() -> None:
    args = parse_args()
    render_preview(
        Path(args.input).resolve(), Path(args.output).resolve(), args.azimuth
    )


if __name__ == "__main__":
    main()
