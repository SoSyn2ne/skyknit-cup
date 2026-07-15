"""Export one Milestone 37 Blender source as a runtime GLB.

Examples:

    blender --background --python tools/blender/export_character_asset.py -- \
      --input assets/source/characters/storm-griffin.blend \
      --output public/assets/models/characters/skyknit-griffin.glb

The exporter does not save the opened blend, so a runtime export can never
rewrite the project-authored source hierarchy.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(arguments)


def find_asset_root() -> bpy.types.Object:
    character_root = bpy.data.objects.get("DragonRoot")
    if character_root is not None:
        return character_root
    accessory_roots = [
        obj
        for obj in bpy.data.objects
        if obj.parent is None and obj.get("accessory_origin") == "socket-local"
    ]
    if len(accessory_roots) != 1:
        raise RuntimeError(
            "Expected DragonRoot or exactly one project-authored accessory root"
        )
    return accessory_roots[0]


def validate_source(root: bpy.types.Object) -> None:
    if root.get("asset_license") != "project-authored":
        raise RuntimeError("Source asset is missing the project-authored license")
    meshes = [obj for obj in (root, *root.children_recursive) if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Source asset has no render meshes")
    for obj in meshes:
        if len(obj.modifiers) != 0:
            raise RuntimeError(f"Runtime source has unapplied modifiers: {obj.name}")
        obj.data.calc_loop_triangles()
        if any(len(polygon.vertices) != 3 for polygon in obj.data.polygons):
            raise RuntimeError(f"Runtime source is not triangulated: {obj.name}")


def export_asset(source: Path, output: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root = find_asset_root()
    validate_source(root)

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
    print(
        "CHARACTER_EXPORT="
        f"asset={root.get('asset_id')};source={source};output={output};bytes={output.stat().st_size}"
    )


def main() -> None:
    args = parse_args()
    export_asset(Path(args.input).resolve(), Path(args.output).resolve())


if __name__ == "__main__":
    main()
