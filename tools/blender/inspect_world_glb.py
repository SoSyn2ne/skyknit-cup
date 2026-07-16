"""Validate project-authored world GLBs through Blender's glTF importer."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSET_ROOT = ROOT / "public" / "assets" / "models" / "world"
ASSET_VERSION = "0.7"
ASSET_VERSIONS = {
    "volcanic-archipelago": "0.9",
}
GEOMETRY_STYLE = "handcrafted-layered"
FESTIVAL_ROUTE_CLEARANCE = 1.2
FESTIVAL_ROUTE_SAMPLE_STEP = 0.25
VOLCANIC_REGION_CENTER = (-240.0, 28.0, -820.0)
VOLCANIC_CHALLENGE_HOTSPOT = (-240.0, 34.0, -720.0)
VOLCANIC_CHALLENGE_RADIUS = 9.0
VOLCANIC_TRIANGLE_TARGETS = {
    "high": (30_000, 40_000),
    "low": (8_000, 12_000),
}

# Three.js local coordinates, before the festival region container offset.
FESTIVAL_COIN_ROUTE = (
    (0.0, 9.0, 26.0),
    (16.0, 11.0, 18.0),
    (28.0, 13.0, 4.0),
    (34.0, 14.0, -10.0),
    (22.0, 16.0, -28.0),
    (2.0, 14.0, -36.0),
    (-14.0, 16.0, -26.0),
    (-20.0, 20.0, -14.0),
    (-24.0, 15.0, 4.0),
    (-28.0, 14.0, 16.0),
)

PBR_MATERIAL_CONTRACT = {
    "M_World_Gold": (0.34, 0.14, 0.05),
    "M_World_Rune": (0.30, 0.04, 0.15),
}

LANDING_PAD_ORIGINS = {
    "festival-hub": (0.0, 0.0, -3.15),
    "wind-canyon": (0.0, -4.0, -14.0),
    "cloud-ruins": (0.0, 0.0, -3.55),
    "volcanic-archipelago": (0.0, -72.0, -5.0),
}

SEMANTIC_ORIGINS = {
    "festival-hub": {
        "FestivalAirfield": (0.0, 0.0, -12.0),
        "FestivalTower": (-18.0, 14.0, 2.3),
        "FestivalFlags": (33.6673, 4.7445, 3.4),
        "RaceArch": (25.8, 10.0, 5.0),
        "WindLoom": (16.0, -18.0, 16.0),
        "SecretGrotto": (-42.0, -18.0, 0.0),
        "TowerLandingPad": (-24.0, 22.0, 18.0),
        "GrottoLandingPad": (-42.0, -28.0, -2.0),
    },
    "wind-canyon": {
        "CanyonCliffs": (-38.0, -68.0, -22.0),
        "WindTunnel": (22.0, 34.0, -8.0),
        "BrokenBridge": (-38.0, -34.0, -2.5),
    },
    "cloud-ruins": {
        "CloudTemple": (36.0, 0.0, -11.0),
        "RunePillars": (29.0, 0.0, 2.8),
        "TempleSteps": (0.0, 12.0, -3.8),
        "FloatingSlabs": (25.0, 0.0, 14.0),
    },
    "volcanic-archipelago": {
        "VolcanoCaldera": (0.0, 4.0, -8.0),
        "ObsidianIslands": (-58.0, 24.0, -2.0),
        "CoolingRuins": (-39.0, 38.0, 15.5),
        "BrokenBridge": (-47.0, 4.0, 14.0),
        "LavaSurface": (0.0, 4.0, 19.2),
        "ExpeditionBeacon": (0.0, -100.0, 6.0),
        "CoolingSeal_1": (-55.0, 23.0, 17.0),
        "CoolingSeal_2": (44.0, -34.0, 16.0),
        "CoolingSeal_3": (28.0, 55.0, 17.0),
        "EscapeGate": (0.0, 82.0, 25.0),
        "Thermal_1": (-56.0, -5.0, 20.0),
        "Thermal_2": (48.0, 8.0, 22.0),
        "Thermal_3": (4.0, 49.0, 26.0),
        "RockSpawner_1": (-27.0, -23.0, 42.0),
        "RockSpawner_2": (31.0, 22.0, 45.0),
        "RockSpawner_3": (2.0, 61.0, 48.0),
        "LavaWaveOrigin": (0.0, 4.0, 19.5),
    },
}

REGION_NODES = {
    "festival-hub": (
        "FestivalAirfield",
        "FestivalTower",
        "FestivalFlags",
        "RaceArch",
        "WindLoom",
        "SecretGrotto",
        "TowerLandingPad",
        "GrottoLandingPad",
    ),
    "wind-canyon": (
        "CanyonCliffs",
        "WindTunnel",
        "BrokenBridge",
    ),
    "cloud-ruins": (
        "CloudTemple",
        "RunePillars",
        "TempleSteps",
        "FloatingSlabs",
    ),
    "volcanic-archipelago": (
        "VolcanoCaldera",
        "ObsidianIslands",
        "CoolingRuins",
        "BrokenBridge",
        "LavaSurface",
        "ExpeditionBeacon",
        "CoolingSeal_1",
        "CoolingSeal_2",
        "CoolingSeal_3",
        "EscapeGate",
        "Thermal_1",
        "Thermal_2",
        "Thermal_3",
        "RockSpawner_1",
        "RockSpawner_2",
        "RockSpawner_3",
        "LavaWaveOrigin",
    ),
}

SEMANTIC_NODE_TYPES = {
    "festival-hub": {
        "WindLoom": "MESH",
        "SecretGrotto": "MESH",
        "TowerLandingPad": "EMPTY",
        "GrottoLandingPad": "EMPTY",
        "FestivalAccents": "MESH",
    },
    "volcanic-archipelago": {
        "LavaSurface": "MESH",
        "CoolingSeal_1": "MESH",
        "CoolingSeal_2": "MESH",
        "CoolingSeal_3": "MESH",
        "EscapeGate": "MESH",
        "Thermal_1": "EMPTY",
        "Thermal_2": "EMPTY",
        "Thermal_3": "EMPTY",
        "RockSpawner_1": "EMPTY",
        "RockSpawner_2": "EMPTY",
        "RockSpawner_3": "EMPTY",
        "LavaWaveOrigin": "EMPTY",
    },
}

EXPECTED_NODE_METADATA = {
    "festival-hub": {
        "FestivalAirfield": {
            "collision_proxy": "layered-island-clear-runway",
        },
        "FestivalTower": {"collision_proxy": "spire-column"},
        "RaceArch": {"collision_proxy": "twin-pylons-clear-center"},
        "WindLoom": {"collision_proxy": "twin-pylons-clear-center"},
        "SecretGrotto": {"collision_proxy": "curved-shell-clear-cavern"},
        "LandingPad": {"landing_surfaces": "hub,tower,grotto"},
        "FestivalAccents": {"accent_material_contract": "gold,rune"},
    },
    "volcanic-archipelago": {
        "RegionRoot": {
            "story_chapter": "heart-of-the-sun",
            "runtime_lava_material": "LavaSurface",
        },
        "LavaSurface": {"semantic": "LavaSurface"},
    },
}


def gltf_to_blender(point: tuple[float, float, float]) -> Vector:
    return Vector((point[0], -point[2], point[1]))


def blender_to_gltf(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return (point[0], point[2], -point[1])


def build_world_bvhs(meshes: list[bpy.types.Object]) -> list[BVHTree]:
    trees: list[BVHTree] = []
    for obj in meshes:
        vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        polygons = [tuple(polygon.vertices) for polygon in obj.data.polygons]
        trees.append(BVHTree.FromPolygons(vertices, polygons, all_triangles=False))
    return trees


def nearest_surface_distance(point: Vector, trees: list[BVHTree]) -> float:
    distances = [
        result[3]
        for tree in trees
        if (result := tree.find_nearest(point)) is not None
    ]
    return min(distances, default=math.inf)


def route_segment_clearance(
    start: Vector,
    end: Vector,
    trees: list[BVHTree],
) -> float:
    length = (end - start).length
    sample_count = max(1, math.ceil(length / FESTIVAL_ROUTE_SAMPLE_STEP))
    return min(
        nearest_surface_distance(start.lerp(end, index / sample_count), trees)
        for index in range(sample_count + 1)
    )


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ASSET_ROOT))
    parser.add_argument("--region", choices=tuple(REGION_NODES))
    parser.add_argument(
        "--scope",
        default=os.environ.get("DRAGON_QA_SCOPE", "rc7"),
    )
    return parser.parse_args(arguments)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def inspect_asset(path: Path, region_id: str, lod: str) -> dict[str, object]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    triangles = 0
    primitives = 0
    vertex_color_meshes = 0
    varied_vertex_color_meshes = 0
    invalid_normal_meshes: list[str] = []
    non_finite_transform_nodes: list[str] = []
    mesh_triangles: dict[str, int] = {}
    for obj in meshes:
        obj.data.calc_loop_triangles()
        object_triangles = len(obj.data.loop_triangles)
        triangles += object_triangles
        mesh_triangles[obj.name] = object_triangles
        primitives += max(1, len(obj.data.materials))
        if len(obj.data.color_attributes) > 0:
            vertex_color_meshes += 1
            colors = {
                tuple(round(float(channel), 3) for channel in item.color[:3])
                for attribute in obj.data.color_attributes
                for item in attribute.data
            }
            if len(colors) >= 3:
                varied_vertex_color_meshes += 1
        if any(
            not all(math.isfinite(float(channel)) for channel in vertex.normal)
            or vertex.normal.length_squared < 0.5
            for vertex in obj.data.vertices
        ):
            invalid_normal_meshes.append(obj.name)

    for obj in bpy.data.objects:
        if not all(
            math.isfinite(float(value))
            for row in obj.matrix_world
            for value in row
        ):
            non_finite_transform_nodes.append(obj.name)

    root = bpy.data.objects.get("RegionRoot")
    extra_required_nodes = (
        ("FestivalAccents",) if region_id == "festival-hub" else ()
    )
    required_nodes = (
        "RegionRoot",
        "LandingPad",
        *REGION_NODES[region_id],
        *extra_required_nodes,
    )
    missing_nodes = [
        node for node in required_nodes if bpy.data.objects.get(node) is None
    ]
    material_objects = sorted(
        {
            material
            for obj in meshes
            for material in obj.data.materials
            if material is not None
        },
        key=lambda material: material.name,
    )
    materials = [material.name for material in material_objects]
    errors: list[str] = []
    if region_id == "volcanic-archipelago":
        minimum_triangles, maximum_triangles = VOLCANIC_TRIANGLE_TARGETS[lod]
    else:
        minimum_triangles = 12_000 if lod == "high" else 3_000
        maximum_triangles = 60_000 if lod == "high" else 25_000
    if not minimum_triangles <= triangles <= maximum_triangles:
        errors.append(f"triangles out of range: {triangles}")
    if primitives > 12:
        errors.append(f"primitive budget exceeded: {primitives}")
    if len(materials) > 8:
        errors.append(f"material budget exceeded: {len(materials)}")
    if vertex_color_meshes != len(meshes):
        errors.append(
            f"vertex colors missing: {vertex_color_meshes}/{len(meshes)}"
        )
    if varied_vertex_color_meshes != len(meshes):
        errors.append(
            "vertex color variation missing: "
            f"{varied_vertex_color_meshes}/{len(meshes)}"
        )
    if invalid_normal_meshes:
        errors.append("invalid normals: " + ", ".join(invalid_normal_meshes))
    if non_finite_transform_nodes:
        errors.append(
            "non-finite transforms: " + ", ".join(non_finite_transform_nodes)
        )
    if missing_nodes:
        errors.append("missing nodes: " + ", ".join(missing_nodes))

    semantic_types: dict[str, str] = {}
    for node, expected_type in SEMANTIC_NODE_TYPES.get(region_id, {}).items():
        obj = bpy.data.objects.get(node)
        if obj is None:
            continue
        semantic_types[node] = obj.type
        if obj.type != expected_type:
            errors.append(
                f"{node} type changed: {obj.type} (expected {expected_type})"
            )

    semantic_metadata: dict[str, dict[str, object]] = {}
    for node, expected_values in EXPECTED_NODE_METADATA.get(region_id, {}).items():
        obj = bpy.data.objects.get(node)
        if obj is None:
            continue
        actual_values = {
            key: obj.get(key)
            for key in expected_values
        }
        semantic_metadata[node] = actual_values
        for key, expected_value in expected_values.items():
            if actual_values[key] != expected_value:
                errors.append(
                    f"{node} metadata changed: {key}={actual_values[key]!r}"
                )

    material_pbr: dict[str, dict[str, float]] = {}
    accent_materials: list[str] = []
    if region_id == "festival-hub":
        accent_obj = bpy.data.objects.get("FestivalAccents")
        if accent_obj is not None and accent_obj.type == "MESH":
            accent_materials = sorted(
                material.name.split(".", 1)[0]
                for material in accent_obj.data.materials
                if material is not None
            )
            if accent_materials != sorted(PBR_MATERIAL_CONTRACT):
                errors.append(
                    "FestivalAccents materials changed: "
                    + ", ".join(accent_materials)
                )

        for base_name, (roughness, metallic, emission_minimum) in (
            PBR_MATERIAL_CONTRACT.items()
        ):
            material = next(
                (
                    candidate
                    for candidate in material_objects
                    if candidate.name == base_name
                    or candidate.name.startswith(base_name + ".")
                ),
                None,
            )
            if material is None:
                errors.append(f"missing PBR accent material: {base_name}")
                continue
            shader = (
                material.node_tree.nodes.get("Principled BSDF")
                if material.use_nodes and material.node_tree is not None
                else None
            )
            if shader is None:
                errors.append(f"missing PBR shader: {base_name}")
                continue
            actual_roughness = float(shader.inputs["Roughness"].default_value)
            actual_metallic = float(shader.inputs["Metallic"].default_value)
            emission = shader.inputs["Emission Color"].default_value
            emission_peak = max(float(channel) for channel in emission[:3])
            material_pbr[base_name] = {
                "roughness": round(actual_roughness, 4),
                "metallic": round(actual_metallic, 4),
                "emission_peak": round(emission_peak, 4),
            }
            if abs(actual_roughness - roughness) > 0.01:
                errors.append(f"{base_name} roughness changed: {actual_roughness}")
            if abs(actual_metallic - metallic) > 0.01:
                errors.append(f"{base_name} metallic changed: {actual_metallic}")
            if emission_peak < emission_minimum:
                errors.append(f"{base_name} emission missing: {emission_peak}")

    coin_mesh_clearance: list[float] = []
    route_mesh_clearance: list[float] = []
    if region_id == "festival-hub":
        trees = build_world_bvhs(meshes)
        route = [gltf_to_blender(point) for point in FESTIVAL_COIN_ROUTE]
        for index, point in enumerate(route):
            clearance = nearest_surface_distance(point, trees)
            coin_mesh_clearance.append(round(clearance, 4))
            if clearance < FESTIVAL_ROUTE_CLEARANCE:
                errors.append(
                    f"coin {index + 1} mesh clearance: {clearance:.4f}"
                )
        for index, (start, end) in enumerate(zip(route, route[1:])):
            clearance = route_segment_clearance(start, end, trees)
            route_mesh_clearance.append(round(clearance, 4))
            if clearance < FESTIVAL_ROUTE_CLEARANCE:
                errors.append(
                    f"coin {index + 1}->{index + 2} route clearance: "
                    f"{clearance:.4f}"
                )
    if root is None:
        asset_version = None
        asset_license = None
        root_region = None
        root_lod = None
        geometry_style = None
    else:
        asset_version = root.get("asset_version")
        asset_license = root.get("asset_license")
        root_region = root.get("region_id")
        root_lod = root.get("lod")
        geometry_style = root.get("geometry_style")
    expected_asset_version = ASSET_VERSIONS.get(region_id, ASSET_VERSION)
    if asset_version != expected_asset_version:
        errors.append(f"unexpected asset version: {asset_version}")
    if asset_license != "project-authored":
        errors.append(f"unexpected asset license: {asset_license}")
    if root_region != region_id:
        errors.append(f"unexpected region id: {root_region}")
    if root_lod != lod:
        errors.append(f"unexpected lod: {root_lod}")
    if geometry_style != GEOMETRY_STYLE:
        errors.append(f"unexpected geometry style: {geometry_style}")

    if root is not None:
        root_transform = (*root.location, *root.rotation_euler, *root.scale)
        expected_root_transform = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
        if any(
            abs(float(actual) - expected) > 1e-4
            for actual, expected in zip(root_transform, expected_root_transform)
        ):
            errors.append("RegionRoot transform contract changed")

    landing_pad = bpy.data.objects.get("LandingPad")
    landing_pad_origin = None
    if landing_pad is not None:
        landing_pad_origin = tuple(round(float(value), 4) for value in landing_pad.location)
        if any(
            abs(actual - expected) > 1e-3
            for actual, expected in zip(
                landing_pad_origin, LANDING_PAD_ORIGINS[region_id]
            )
        ):
            errors.append(
                f"LandingPad origin changed: {landing_pad_origin}"
            )

    styled_nodes = [
        node
        for node in REGION_NODES[region_id]
        if (obj := bpy.data.objects.get(node)) is not None
        and obj.get("geometry_style") == GEOMETRY_STYLE
    ]
    if len(styled_nodes) != len(REGION_NODES[region_id]):
        errors.append(
            "authored style metadata missing: "
            f"{len(styled_nodes)}/{len(REGION_NODES[region_id])}"
        )

    semantic_origins: dict[str, tuple[float, float, float]] = {}
    for node, expected_origin in SEMANTIC_ORIGINS[region_id].items():
        obj = bpy.data.objects.get(node)
        if obj is None:
            continue
        actual_origin = tuple(round(float(value), 4) for value in obj.location)
        semantic_origins[node] = actual_origin
        if any(
            abs(actual - expected) > 1e-3
            for actual, expected in zip(actual_origin, expected_origin)
        ):
            errors.append(f"{node} origin changed: {actual_origin}")

    interaction_contract: dict[str, object] = {}
    if region_id == "volcanic-archipelago":
        beacon_origin = semantic_origins.get("ExpeditionBeacon")
        if beacon_origin is not None:
            runtime_local = blender_to_gltf(beacon_origin)
            runtime_world = tuple(
                region + local
                for region, local in zip(VOLCANIC_REGION_CENTER, runtime_local)
            )
            hotspot_distance = math.dist(
                runtime_world,
                VOLCANIC_CHALLENGE_HOTSPOT,
            )
            within_radius = hotspot_distance <= VOLCANIC_CHALLENGE_RADIUS
            interaction_contract["ExpeditionBeacon"] = {
                "runtime_region_center": list(VOLCANIC_REGION_CENTER),
                "runtime_local": [round(value, 4) for value in runtime_local],
                "runtime_world": [round(value, 4) for value in runtime_world],
                "challenge_hotspot": list(VOLCANIC_CHALLENGE_HOTSPOT),
                "interaction_radius": VOLCANIC_CHALLENGE_RADIUS,
                "distance": round(hotspot_distance, 4),
                "within_radius": within_radius,
            }
            if not within_radius:
                errors.append(
                    "ExpeditionBeacon is outside challenge hotspot: "
                    f"{hotspot_distance:.4f} > {VOLCANIC_CHALLENGE_RADIUS:.4f}"
                )

    return {
        "file": str(path),
        "bytes": path.stat().st_size,
        "region": region_id,
        "lod": lod,
        "triangles": triangles,
        "triangle_target": {
            "minimum": minimum_triangles,
            "maximum": maximum_triangles,
        },
        "mesh_triangles": mesh_triangles,
        "render_meshes": len(meshes),
        "primitives": primitives,
        "materials": materials,
        "vertex_color_meshes": vertex_color_meshes,
        "varied_vertex_color_meshes": varied_vertex_color_meshes,
        "invalid_normal_meshes": invalid_normal_meshes,
        "non_finite_transform_nodes": non_finite_transform_nodes,
        "required_nodes": list(required_nodes),
        "asset_version": asset_version,
        "asset_license": asset_license,
        "geometry_style": geometry_style,
        "landing_pad_origin": landing_pad_origin,
        "semantic_origins": semantic_origins,
        "interaction_contract": interaction_contract,
        "semantic_types": semantic_types,
        "semantic_metadata": semantic_metadata,
        "accent_materials": accent_materials,
        "material_pbr": material_pbr,
        "coin_mesh_clearance": coin_mesh_clearance,
        "route_mesh_clearance": route_mesh_clearance,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    scope = args.scope.strip() or "rc7"
    if not all(character.isalnum() or character in "-_" for character in scope):
        raise SystemExit(f"invalid artifact scope: {scope}")
    asset_root = Path(args.root).resolve()
    regions = (args.region,) if args.region else tuple(REGION_NODES)
    reports: list[dict[str, object]] = []
    errors: list[str] = []

    for region_id in regions:
        for lod in ("high", "low"):
            path = asset_root / f"{region_id}-{lod}.glb"
            if not path.exists():
                errors.append(f"missing file: {path}")
                continue
            report = inspect_asset(path, region_id, lod)
            reports.append(report)
            errors.extend(
                f"{path.name}: {message}"
                for message in report["errors"]
            )

    for region_id in regions:
        pair = [report for report in reports if report["region"] == region_id]
        high = next((item for item in pair if item["lod"] == "high"), None)
        low = next((item for item in pair if item["lod"] == "low"), None)
        if high is not None and low is not None:
            if int(low["triangles"]) >= int(high["triangles"]):
                errors.append(f"{region_id}: low LOD is not smaller than high")
            if int(low["bytes"]) >= int(high["bytes"]):
                errors.append(
                    f"{region_id}: low LOD file is not smaller than high"
                )

    result = {
        "scope": scope,
        "asset_version": ASSET_VERSION,
        "asset_versions": {**{region: ASSET_VERSION for region in REGION_NODES}, **ASSET_VERSIONS},
        "asset_root": str(asset_root),
        "reports": reports,
        "errors": errors,
    }
    report_name = (
        f"world-glb-report-{args.region}.json"
        if args.region
        else "world-glb-report.json"
    )
    report_path = ROOT / "artifacts" / f"world-{scope}" / report_name
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf8",
    )
    print("WORLD_GLTF_REPORT=" + json.dumps(result, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
