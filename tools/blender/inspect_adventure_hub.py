"""Inspect the M46 hub's exported geometry, axes, semantics and transfer budget.

Run with Blender 4.5 --background --threads 2 --python-exit-code 1 --python
tools/blender/inspect_adventure_hub.py. This imports the actual runtime GLB,
not the source mesh, and emits an ADVENTURE_GLTF_REPORT JSON record to stdout.
"""

from __future__ import annotations

import gzip
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public/assets/models/world/adventure-hub.glb"
ORIGINS = {
    "AdventureRoot": (0, 0, 0),
    "Terrain": (0, 0, 0),
    "Nest": (0, 0, 0),
    "WindmillTower": (-19, 0, -12),
    "WindmillRotor": (-19, 14, -12),
    "Keeper": (8, 1.2, -2),
    "Lanterns": (0, 0, 0),
    "Pennants": (0, 0, 0),
    "SecretPath": (0, 0, 0),
    "Bird": (0, 0, 0),
    "BirdPerch": (0, 0, 0),
    "RelayDevice": (0, 0, 0),
    "Relic": (0, 0, 0),
    "Charm": (0, 0, 0),
}
TEMPLATES = ("Bird", "BirdPerch", "RelayDevice", "Relic", "Charm")
GARDEN_CENTER = (60.0, 8.0, 40.0)
GARDEN_RADIUS = 10.0


def vector(point: tuple[float, float, float]) -> Vector:
    return Vector((point[0], -point[2], point[1]))


def main() -> None:
    if not ASSET.is_file():
        raise SystemExit(f"missing runtime asset: {ASSET}")
    data = ASSET.read_bytes()
    magic, version, size = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and size == len(data)
    json_size, json_type = struct.unpack_from("<II", data, 12)
    assert json_type == 0x4E4F534A
    gltf = json.loads(data[20:20 + json_size])
    errors: list[str] = []
    gzip_bytes = len(gzip.compress(data, compresslevel=9, mtime=0))
    primitives = sum(len(mesh["primitives"]) for mesh in gltf["meshes"])
    if gzip_bytes > 140 * 1024:
        errors.append(f"gzip exceeds 140KiB: {gzip_bytes}")
    if primitives > 14 or len(gltf.get("materials", [])) > 5:
        errors.append("primitive/material budget exceeded")
    if gltf.get("textures") or gltf.get("images"):
        errors.append("texture-free contract violated")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ASSET))
    triangle_counts: dict[str, int] = {}
    origins: dict[str, list[float]] = {}
    bounds: dict[str, dict[str, list[float]]] = {}
    trees: list[BVHTree] = []
    garden_tree = None
    terrain_tree = None
    for name, origin in ORIGINS.items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            errors.append(f"missing semantic: {name}")
            continue
        actual = obj.matrix_world.translation
        origins[name] = [round(actual.x, 4), round(actual.z, 4), round(-actual.y, 4)]
        if (actual - vector(origin)).length > 0.001:
            errors.append(f"wrong semantic origin: {name}: {origins[name]}")
        if any(not math.isfinite(value) for row in obj.matrix_world for value in row):
            errors.append(f"non-finite transform: {name}")
        if name != "AdventureRoot" and obj.type != "MESH":
            errors.append(f"semantic must be merged mesh: {name}")
        if name == "AdventureRoot":
            for key, expected in {
                "asset_license": "project-authored", "asset_version": "0.46",
                "geometry_style": "handcrafted-nest-and-windmill",
                "landing_radius": 14.0,
            }.items():
                if obj.get(key) != expected:
                    errors.append(f"missing root metadata: {key}")
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        triangle_counts[name] = len(mesh.loop_triangles)
        if not mesh.color_attributes:
            errors.append(f"missing vertex colors: {name}")
        for vert in mesh.vertices:
            if not all(math.isfinite(value) for value in (*vert.co, *vert.normal)):
                errors.append(f"non-finite geometry/normal: {name}")
                break
            if vert.normal.length_squared < 0.5:
                errors.append(f"invalid normal: {name}")
                break
        if any(triangle.area < 1e-9 for triangle in mesh.loop_triangles):
            errors.append(f"degenerate triangle: {name}")
        vertices = [obj.matrix_world @ vert.co for vert in mesh.vertices]
        if name == "Terrain":
            terrain_tree = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons])
        if name == "SecretPath":
            if tuple(obj.get("destination_local_y_up", ())) != GARDEN_CENTER:
                errors.append("missing secret garden destination coordinate")
            if obj.get("destination_landing_radius") != GARDEN_RADIUS:
                errors.append("missing secret garden landing radius")
            if obj.get("destination_semantic") != "SecretGarden":
                errors.append("missing secret garden semantic")
            garden_tree = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons])
        xyz = [(v.x, v.z, -v.y) for v in vertices]
        bounds[name] = {
            "min": [round(min(v[i] for v in xyz), 3) for i in range(3)],
            "max": [round(max(v[i] for v in xyz), 3) for i in range(3)],
        }
        if name not in (*TEMPLATES, "Keeper", "SecretPath", "Lanterns", "Pennants"):
            trees.append(BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons]))
    total_triangles = sum(triangle_counts.values())
    if total_triangles > 14_000 or total_triangles < 1_000:
        errors.append(f"triangle budget or meaningful-geometry threshold: {total_triangles}")
    # The feet plane is +1.2 above the authored y=0 landing surface. The central
    # 6m radius is unobstructed; keeper at x=8 is an intentional interactive actor.
    clearances = []
    for radius in (0, 3, 6):
        for index in range(16):
            angle = index * math.tau / 16
            point = vector((radius * math.cos(angle), 1.2, radius * math.sin(angle)))
            nearest = min(tree.find_nearest(point)[3] for tree in trees)
            clearances.append(nearest)
    if min(clearances, default=0) < 1.19:
        errors.append(f"landing clearance below 1.19: {min(clearances)}")
    rotor = bounds.get("WindmillRotor")
    if rotor and (rotor["max"][1] - rotor["min"][1] < 17):
        errors.append("windmill silhouette too small")
    terrain = bounds.get("Terrain")
    if terrain and terrain["max"][1] > 0.001:
        errors.append("terrain crosses landing plane")
    # Ray samples prove that the exported path ends in a usable terrace, not
    # merely an arch or a metadata-only destination. Decor stays beyond 10m.
    garden_samples = []
    if garden_tree:
        for radius in (0, 5, 10):
            for index in range(16):
                angle = index * math.tau / 16
                point = (GARDEN_CENTER[0] + radius * math.cos(angle),
                         GARDEN_CENTER[1] + 2, GARDEN_CENTER[2] + radius * math.sin(angle))
                hit, normal, _, distance = garden_tree.ray_cast(vector(point), vector((0, -1, 0)), 2.05)
                supported = hit is not None and 1.99 <= distance <= 2.01 and normal.dot(vector((0, 1, 0))) > 0.99
                garden_samples.append(supported)
        if not all(garden_samples):
            errors.append(f"secret garden terrace unsupported or obstructed: {garden_samples.count(False)} samples")
    terrain_cap_samples = []
    if terrain_tree:
        for index in range(32):
            angle = index * math.tau / 32
            point = vector((17 * math.cos(angle), 2, 17 * math.sin(angle)))
            hit, normal, _, distance = terrain_tree.ray_cast(point, vector((0, -1, 0)), 3)
            terrain_cap_samples.append(hit is not None and 2.34 < distance < 2.36
                                       and normal.dot(vector((0, 1, 0))) > 0.99)
        if not all(terrain_cap_samples):
            errors.append(f"terrain outer cap must face upward: {terrain_cap_samples.count(False)} samples")
    report = {
        "file": str(ASSET), "bytes": len(data), "gzip9_bytes": gzip_bytes,
        "triangles": total_triangles, "primitives": primitives,
        "materials": [item["name"] for item in gltf["materials"]],
        "mesh_triangles": triangle_counts, "semantic_origins_y_up": origins,
        "bounds_y_up": bounds, "min_landing_clearance": round(min(clearances), 4),
        "secret_garden_local_y_up": GARDEN_CENTER, "secret_garden_radius": GARDEN_RADIUS,
        "secret_garden_supported_samples": sum(garden_samples), "secret_garden_samples": len(garden_samples),
        "terrain_cap_front_samples": sum(terrain_cap_samples), "terrain_cap_samples": len(terrain_cap_samples),
        "asset_license": "project-authored", "errors": errors,
    }
    print("ADVENTURE_GLTF_REPORT=" + json.dumps(report, separators=(",", ":")))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
