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
    world.collapse_neutral_material_slots(joined, material)
    return _mark_semantic(joined, name)


def _build_materials() -> dict[str, bpy.types.Material]:
    return {
        "obsidian": world.make_material(
            "M_Volcanic_Obsidian", (0.035, 0.045, 0.065, 1.0), 0.24, 0.62
        ),
        "basalt": world.make_material(
            "M_Volcanic_Basalt", (0.12, 0.105, 0.13, 1.0), 0.88, 0.04
        ),
        "ash": world.make_material(
            "M_Volcanic_Ash", (0.255, 0.22, 0.24, 1.0), 0.96
        ),
        "ruin": world.make_material(
            "M_Volcanic_Ruin", (0.30, 0.34, 0.35, 1.0), 0.76, 0.06
        ),
        "cooling": world.make_material(
            "M_Volcanic_Cooling", (0.04, 0.82, 0.76, 1.0), 0.24, 0.08, 0.72
        ),
        "lava": world.make_material(
            "M_Volcanic_Lava", (1.0, 0.16, 0.025, 1.0), 0.32, 0.02, 1.8
        ),
        "ember": world.make_material(
            "M_Volcanic_Ember", (1.0, 0.54, 0.08, 1.0), 0.30, 0.05, 0.9
        ),
    }


def _build_caldera(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    segments = 40 if lod == "high" else 20
    caldera_parts: list[bpy.types.Object] = [
        world.add_layered_form(
            f"CalderaCore_{tag}",
            (0.0, 4.0, -8.0),
            [
                (-18.0, 50.0, 43.0),
                (-8.0, 44.0, 39.0),
                (3.0, 34.0, 31.0),
                (15.0, 25.0, 23.0),
                (24.0, 17.0, 16.0),
                (28.0, 13.0, 12.0),
            ],
            materials["basalt"],
            collection,
            root,
            segments,
            seed=39.0,
            irregularity=0.11,
            lean=(2.0, -1.5),
        )
    ]
    ridge_count = 18 if lod == "high" else 12
    subdivision = 3 if lod == "high" else 2
    for index in range(ridge_count):
        angle = index / ridge_count * math.tau
        radius = 27.0 + math.sin(index * 2.1) * 5.0
        caldera_parts.append(
            world.add_ico(
                f"CalderaRidge_{index}_{tag}",
                (
                    math.cos(angle) * radius,
                    4.0 + math.sin(angle) * radius * 0.84,
                    8.0 + math.sin(index * 1.7) * 5.0,
                ),
                (
                    11.0 + (index % 3) * 2.4,
                    8.0 + (index % 4) * 1.1,
                    16.0 + (index % 5) * 2.0,
                ),
                materials["obsidian"] if index % 3 == 0 else materials["basalt"],
                collection,
                root,
                subdivision,
            )
        )
    if lod == "high":
        for index in range(30):
            angle = index / 30.0 * math.tau + 0.07 * math.sin(index * 1.9)
            radius = 35.0 + math.sin(index * 1.3) * 6.0
            caldera_parts.append(
                world.add_ico(
                    f"CalderaCrestShard_{index}_{tag}",
                    (
                        math.cos(angle) * radius,
                        4.0 + math.sin(angle) * radius * 0.86,
                        12.0 + math.sin(index * 2.2) * 6.0,
                    ),
                    (3.4 + index % 3, 2.6 + index % 2, 7.0 + index % 5),
                    materials["basalt"],
                    collection,
                    root,
                    3,
                )
            )
    _join(caldera_parts, "VolcanoCaldera", tag, root, materials["basalt"])

    lava = world.add_layered_form(
        f"LavaSurface__{tag}",
        (0.0, 4.0, 19.2),
        [(-0.35, 13.1, 11.6), (0.35, 12.8, 11.3)],
        materials["lava"],
        collection,
        root,
        64 if lod == "high" else 32,
        seed=7.0,
        irregularity=0.045,
    )
    _mark_semantic(lava, "LavaSurface")


def _build_islands(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    island_specs = [
        (-58.0, 24.0, -2.0, 20.0, 15.0, 10.0),
        (-42.0, -38.0, 6.0, 18.0, 13.0, 9.0),
        (44.0, -34.0, 2.0, 23.0, 16.0, 11.0),
        (61.0, 19.0, 7.0, 19.0, 14.0, 10.0),
        (26.0, 56.0, 3.0, 21.0, 15.0, 9.0),
        (-27.0, 61.0, 9.0, 17.0, 12.0, 8.0),
        (-77.0, -19.0, 13.0, 14.0, 10.0, 8.0),
        (78.0, -15.0, 16.0, 15.0, 11.0, 8.0),
    ]
    parts: list[bpy.types.Object] = []
    subdivision = 3 if lod == "high" else 2
    shards_per_island = 2 if lod == "high" else 1
    for index, (x, y, z, sx, sy, sz) in enumerate(island_specs):
        parts.append(
            world.add_ico(
                f"ObsidianIsland_{index}_{tag}",
                (x, y, z),
                (sx, sy, sz),
                materials["obsidian"] if index % 2 == 0 else materials["basalt"],
                collection,
                root,
                subdivision,
            )
        )
        for shard in range(shards_per_island):
            parts.append(
                world.add_ico(
                    f"ObsidianShard_{index}_{shard}_{tag}",
                    (
                        x + (shard * 2 - 1) * sx * 0.42,
                        y + math.sin(index + shard) * sy * 0.36,
                        z + sz * 0.92,
                    ),
                    (sx * 0.28, sy * 0.24, sz * (1.1 + shard * 0.22)),
                    materials["obsidian"],
                    collection,
                    root,
                    subdivision,
                )
            )
    _join(parts, "ObsidianIslands", tag, root, materials["obsidian"])


def _build_landing_and_ruins(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    slab_segments = 18 if lod == "high" else 10
    landing_parts = [
        world.add_handcut_slab(
            f"LandingShelf_{tag}",
            (0.0, -78.0, 4.0),
            (18.0, 14.0, 3.0),
            materials["basalt"],
            collection,
            root,
            slab_segments,
            seed=18.0,
        ),
        world.add_torus(
            f"LandingRune_{tag}",
            (0.0, -78.0, 7.15),
            7.2,
            0.42,
            materials["cooling"],
            collection,
            root,
            40 if lod == "high" else 24,
            6,
        ),
    ]
    _join(landing_parts, "LandingPad", tag, root, materials["basalt"])

    ruin_parts: list[bpy.types.Object] = []
    for index, (x, y, height) in enumerate(
        [(-39.0, 38.0, 15.0), (-30.0, 44.0, 11.0), (38.0, 36.0, 17.0), (47.0, 43.0, 12.0)]
    ):
        ruin_parts.append(
            world.add_flared_column(
                f"CoolingColumn_{index}_{tag}",
                (x, y, 8.0 + height * 0.5),
                2.8,
                height,
                materials["ruin"],
                collection,
                root,
                16 if lod == "high" else 10,
                seed=11.0 + index,
            )
        )
        ruin_parts.append(
            world.add_torus(
                f"CoolingRune_{index}_{tag}",
                (x, y, 8.0 + height),
                2.1,
                0.24,
                materials["cooling"],
                collection,
                root,
                24 if lod == "high" else 14,
                5,
            )
        )
    _join(ruin_parts, "CoolingRuins", tag, root, materials["ruin"])

    bridge_parts: list[bpy.types.Object] = []
    for index in range(9 if lod == "high" else 6):
        bridge_parts.append(
            world.add_handcut_slab(
                f"BridgeSlab_{index}_{tag}",
                (-47.0 + index * 8.0, 4.0 + math.sin(index * 0.8) * 1.8, 14.0 - index * 0.42),
                (4.8, 3.2, 0.8),
                materials["ruin"],
                collection,
                root,
                slab_segments,
                seed=40.0 + index,
                rotation=(0.0, 0.08 * math.sin(index), 0.05 * math.sin(index * 0.7)),
            )
        )
    _join(bridge_parts, "BrokenBridge", tag, root, materials["ruin"])


def _build_mission_landmarks(
    lod: str,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    tag: str,
) -> None:
    seal_positions = [(-55.0, 23.0, 17.0), (44.0, -34.0, 16.0), (28.0, 55.0, 17.0)]
    for index, position in enumerate(seal_positions, start=1):
        parts = [
            world.add_torus(
                f"SealRing_{index}_{tag}",
                position,
                5.6,
                0.62,
                materials["cooling"],
                collection,
                root,
                40 if lod == "high" else 24,
                6,
                rotation=(math.pi / 2.0, 0.0, 0.0),
            ),
            world.add_segment(
                f"SealSpine_{index}_{tag}",
                (position[0], position[1], position[2] - 6.0),
                (position[0], position[1], position[2] + 6.0),
                0.55,
                materials["ruin"],
                collection,
                root,
                12 if lod == "high" else 8,
            ),
        ]
        _join(parts, f"CoolingSeal_{index}", tag, root, materials["cooling"])

    escape = world.add_arch_band(
        f"EscapeGate__{tag}",
        (0.0, 82.0, 25.0),
        11.0,
        8.5,
        1.2,
        materials["ember"],
        collection,
        root,
        32 if lod == "high" else 18,
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    _mark_semantic(escape, "EscapeGate")

    beacon_parts = [
        world.add_arch_band(
            f"BeaconArch_{tag}",
            (0.0, -58.0, 15.0),
            8.0,
            6.0,
            0.9,
            materials["ruin"],
            collection,
            root,
            28 if lod == "high" else 16,
            rotation=(math.pi / 2.0, 0.0, 0.0),
        ),
        world.add_torus(
            f"BeaconCore_{tag}",
            (0.0, -58.0, 15.0),
            4.3,
            0.34,
            materials["cooling"],
            collection,
            root,
            32 if lod == "high" else 18,
            5,
            rotation=(math.pi / 2.0, 0.0, 0.0),
        ),
    ]
    _join(beacon_parts, "ExpeditionBeacon", tag, root, materials["cooling"])

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
