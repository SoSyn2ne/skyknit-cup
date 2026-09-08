"""Author the M46 guardian sanctuary without changing any M43-M45 assets.

Blender 4.5 --background --threads 2 --python-exit-code 1 --python
tools/blender/build_adventure_hub.py

All design coordinates below are Three.js Y-up; conversion happens once at the
mesh boundary. Named parts are merged for runtime visibility/animation, with
vertex colors instead of textures or many material slots. Geometry is wholly
project-authored. Bird/RelayDevice/Relic/Charm are reusable hidden-by-runtime
templates at the origin, not static objects inside the landing pad.
"""

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/world/skyknit-adventure-hub.blend"
OUTPUT = ROOT / "public/assets/models/world/adventure-hub.glb"
TAU = math.tau
STONE = (0.26, 0.33, 0.32)
CAP = (0.51, 0.57, 0.42)
PAVING = (0.57, 0.58, 0.47)
WOOD = (0.24, 0.12, 0.065)
TIMBER = (0.47, 0.27, 0.12)
STRAW = (0.58, 0.39, 0.17)
TEAL = (0.075, 0.30, 0.28)
CLOTH = (0.54, 0.70, 0.60)
CREAM = (0.92, 0.77, 0.51)
CORAL = (0.68, 0.21, 0.12)
GOLD = (0.95, 0.59, 0.19)
INK = (0.035, 0.06, 0.06)
GARDEN_CENTER = (60.0, 8.0, 40.0)
GARDEN_RADIUS = 10.0


def xyz(point) -> tuple[float, float, float]:
    return (point[0], -point[2], point[1])


class Part:
    """Small authoring accumulator; one semantic part becomes one draw mesh."""

    def __init__(self, name, origin=(0, 0, 0), glow=False):
        self.name, self.origin, self.glow = name, origin, glow
        self.vertices, self.faces, self.colors = [], [], []
        self.preserve_winding_faces = 0

    def shape(self, vertices, faces, color):
        offset = len(self.vertices)
        used = sorted({index for face in faces for index in face})
        remap = {original: offset + index for index, original in enumerate(used)}
        self.vertices.extend(vertices[index] for index in used)
        self.faces.extend(tuple(remap[i] for i in face) for face in faces)
        self.colors.extend([color] * len(faces))

    def box(self, center, size, color, angle=0):
        # Rotation around local Y is useful for planks and irregular paving.
        cx, cy, cz = center
        sx, sy, sz = (v / 2 for v in size)
        vertices = []
        for x, y, z in ((-sx, -sy, -sz), (sx, -sy, -sz), (sx, -sy, sz),
                        (-sx, -sy, sz), (-sx, sy, -sz), (sx, sy, -sz),
                        (sx, sy, sz), (-sx, sy, sz)):
            vertices.append((cx + x * math.cos(angle) - z * math.sin(angle),
                             cy + y, cz + x * math.sin(angle) + z * math.cos(angle)))
        self.shape(vertices, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], color)

    def tube(self, start, end, radius, color, sides=6, end_radius=None):
        start, end = Vector(start), Vector(end)
        direction = (end - start).normalized()
        helper = Vector((0, 1, 0)) if abs(direction.y) < 0.9 else Vector((1, 0, 0))
        u = direction.cross(helper).normalized()
        v = direction.cross(u).normalized()
        vertices = []
        for center, rad in ((start, radius), (end, radius if end_radius is None else end_radius)):
            for i in range(sides):
                a = TAU * i / sides
                vertices.append(tuple(center + rad * (math.cos(a) * u + math.sin(a) * v)))
        faces = [tuple(reversed(range(sides))), tuple(range(sides, sides * 2))]
        faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides))
        self.shape(vertices, faces, color)

    def orb(self, center, scale, color, sides=10, rings=5):
        # Poles are unique vertices, avoiding zero-area quads at either end.
        cx, cy, cz = center
        sx, sy, sz = scale
        vertices = [(cx, cy + sy, cz)]
        for j in range(1, rings):
            phi = math.pi * j / rings
            for i in range(sides):
                a = TAU * i / sides
                vertices.append((cx + sx * math.sin(phi) * math.cos(a),
                                 cy + sy * math.cos(phi), cz + sz * math.sin(phi) * math.sin(a)))
        bottom = len(vertices)
        vertices.append((cx, cy - sy, cz))
        faces = [(0, 1 + i, 1 + (i + 1) % sides) for i in range(sides)]
        for row in range(rings - 2):
            for i in range(sides):
                a, b = 1 + row * sides + i, 1 + row * sides + (i + 1) % sides
                faces.append((a, a + sides, b + sides, b))
        last = 1 + (rings - 2) * sides
        faces.extend((bottom, last + (i + 1) % sides, last + i) for i in range(sides))
        self.shape(vertices, faces, color)

    def leaf(self, start, end, width, color, depth=0.08):
        # A tapered solid sail/feather with a raised center ridge.
        a, b = Vector(start), Vector(end)
        d = b - a
        across = Vector((-d.y, d.x, 0)).normalized() * width
        middle = a.lerp(b, 0.58)
        p = [a, middle + across, b, middle - across, middle + Vector((0, 0, depth))]
        vertices = [tuple(v) for v in p] + [tuple(v - Vector((0, 0, depth))) for v in p[:4]]
        self.shape(vertices, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4),
                              (5, 8, 7, 6), (0, 5, 6, 1), (1, 6, 7, 2),
                              (2, 7, 8, 3), (3, 8, 5, 0)], color)

    def finish(self, root, materials):
        mesh = bpy.data.meshes.new(self.name + "_Mesh")
        mesh.from_pydata([xyz(v) for v in self.vertices], [], self.faces)
        mesh.update()
        # Face normals are recomputed after conversion (a proper rotation).
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.normal_update()
        authored_normals = [(face, face.normal.copy())
                            for face in list(bm.faces)[:self.preserve_winding_faces]]
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
        # The colored cliff bands have intentionally split vertices. Blender
        # cannot infer an enclosed volume for these open strips and may turn
        # the cap inward; retain the explicit outward authoring for this shell.
        for face, normal in authored_normals:
            if face.normal.dot(normal) < 0:
                face.normal_flip()
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()
        attribute = mesh.color_attributes.new(name="WorldColor", type="BYTE_COLOR", domain="CORNER")
        for polygon, color in zip(mesh.polygons, self.colors):
            shade = 0.88 + 0.12 * max(0, polygon.normal.z)
            for loop in polygon.loop_indices:
                attribute.data[loop].color = (*[round(channel * shade * 255) / 255 for channel in color], 1)
        mesh.color_attributes.active_color = attribute
        mesh.materials.append(materials[1 if self.glow else 0])
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = root
        obj.location = xyz(self.origin)
        obj["semantic"] = self.name
        obj["geometry_style"] = "handcrafted-nest-and-windmill"
        if self.name in ("Bird", "BirdPerch", "RelayDevice", "Relic", "Charm"):
            obj["runtime_template"] = True
        if self.name == "WindmillRotor":
            obj["runtime_rotation_axis"] = "Z"
        if self.name == "SecretPath":
            obj["destination_semantic"] = "SecretGarden"
            obj["destination_local_y_up"] = GARDEN_CENTER
            obj["destination_landing_radius"] = GARDEN_RADIUS
        return obj


def material(name, glow=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    vertex = result.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "WorldColor"
    result.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.82 if not glow else 0.45
    shader.inputs["Metallic"].default_value = 0.0
    if glow:
        result.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 0.45
    return result


def terrain():
    p = Part("Terrain")
    sides = 32
    rings = [(23, -0.35), (24, -2.8), (18.5, -6), (13.5, -10), (5, -15)]
    vertices = [(0, -0.35, 0)]
    for row, (radius, height) in enumerate(rings):
        for i in range(sides):
            angle = i * TAU / sides
            variation = 1 + 0.04 * math.sin(i * 3.1 + row * 0.8)
            vertices.append((radius * variation * math.cos(angle), height,
                             radius * variation * math.sin(angle)))
    vertices.append((1.5, -18, -1))
    p.shape(vertices, [(0, 1 + (i + 1) % sides, 1 + i) for i in range(sides)], CAP)
    for row in range(len(rings) - 1):
        faces = []
        for i in range(sides):
            a, b = 1 + row * sides + i, 1 + row * sides + (i + 1) % sides
            faces.extend([(a, b, b + sides), (a, b + sides, a + sides)])
        p.shape(vertices, faces, tuple(c * (0.85 + row * 0.035) for c in STONE))
    p.shape(vertices, [(len(vertices) - 1, 1 + 4 * sides + i, 1 + 4 * sides + (i + 1) % sides) for i in range(sides)], STONE)
    p.preserve_winding_faces = len(p.faces)
    # A continuous inset terrace supports the entire 14m landing footprint.
    p.tube((0, -0.65, 0), (0, -0.025, 0), 14.6, PAVING, sides=32)
    for i in range(24):
        a = i * TAU / 24
        p.box((13.45 * math.cos(a), -0.05, 13.45 * math.sin(a)), (2.7, 0.08, 0.48), CREAM, a + math.pi / 2)
    # Hairline slab seams are actual geometry below the landing plane.
    for x in (-9, -4.5, 0, 4.5, 9):
        length = 2 * math.sqrt(13.1 ** 2 - x ** 2)
        p.box((x, -0.014, 0), (0.055, 0.016, length), STONE)
    for z in (-9, -4.5, 0, 4.5, 9):
        length = 2 * math.sqrt(13.1 ** 2 - z ** 2)
        p.box((0, -0.013, z), (length, 0.016, 0.055), STONE)
    # Weathered outcroppings stay outside the flight/landing center.
    for i in range(11):
        a = 0.23 + i * TAU / 11
        p.orb((21 * math.cos(a), -0.85, 21 * math.sin(a)),
              (2 + i % 3 * 0.35, 0.8, 1.9), STONE, sides=7, rings=3)
    return p


def nest():
    p = Part("Nest")
    # An open horseshoe of woven branches; the south mouth frames the player.
    for row in range(3):
        for i in range(23):
            a = math.radians(150) + i * math.radians(240) / 23
            b = a + 0.23
            r = 15.8 + row * 0.45
            p.tube((r * math.cos(a), 0.6 + row * 0.4, r * math.sin(a)),
                   (r * math.cos(b), 0.7 + row * 0.4, r * math.sin(b)),
                   0.24, TIMBER if (i + row) % 3 else STRAW, sides=5)
    # Canopy occupies the far side, never the center or camera approach.
    for x in (-11.5, 11.5):
        for z in (-12, -20):
            p.tube((x, -0.1, z), (x * 0.96, 8.2, z), 0.5, WOOD, sides=7, end_radius=0.32)
            p.tube((x, 5, z), (x - math.copysign(3, x), 8, z), 0.25, TIMBER)
        p.tube((x, 8, -21), (x, 8, -10.5), 0.36, TIMBER)
    for z in (-12, -20):
        p.tube((-13, 8, z), (0, 11, z), 0.38, TIMBER)
        p.tube((0, 11, z), (13, 8, z), 0.38, TIMBER)
    p.tube((0, 11, -21.5), (0, 11, -10), 0.4, WOOD)
    # Separate overlapping feather shingles give the roof a guardian-wing shape.
    for side in (-1, 1):
        for i in range(8):
            z = -20.5 + i * 1.4
            for tier in range(3):
                x0, x1 = side * tier * 4.0, side * (tier * 4.0 + 5.2)
                y0, y1 = 11.15 - tier * 0.95, 9.8 - tier * 0.95
                vertices = [(x0, y0, z - 0.7), (x1, y1, z - 0.8),
                            (x1 + side * 0.5, y1 - 0.18, z + 0.3),
                            (x1 - side * 0.5, y1, z + 0.8), (x0, y0, z + 0.7)]
                bottom = [(x, y - 0.18, zz) for x, y, zz in vertices]
                p.shape(vertices + bottom, [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5),
                        (0, 5, 6, 1), (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4), (4, 9, 5, 0)],
                        TEAL if (i + tier) % 3 else (0.14, 0.40, 0.32))
    # Woven sleeping bowl behind the open landing terrace.
    for i in range(14):
        a = i * TAU / 14
        b = a + 0.5
        p.tube((6.4 * math.cos(a), 0.8, -18 + 3 * math.sin(a)),
               (6.4 * math.cos(b), 1.4, -18 + 3 * math.sin(b)), 0.42, STRAW)
    p.orb((0, 0.35, -18), (5.9, 0.5, 2.55), CREAM, sides=14, rings=3)
    # Carved winged sign above the canopy entrance, not a text billboard.
    p.orb((0, 8.9, -10.8), (0.65, 0.75, 0.32), GOLD)
    p.leaf((-0.1, 8.8, -10.7), (-3, 10.15, -10.7), 0.5, CREAM)
    p.leaf((0.1, 8.8, -10.7), (3, 10.15, -10.7), 0.5, CREAM)
    return p


def windmill():
    tower = Part("WindmillTower", (-19, 0, -12))
    tower.tube((0, -3, 0), (0, 0, 0), 5, STONE, sides=10, end_radius=4.8)
    tower.tube((0, 0, 0), (0, 11.5, 0), 3.6, CREAM, sides=10, end_radius=2.15)
    for y, radius in ((0.2, 3.65), (4.6, 3.04), (9.2, 2.47)):
        tower.tube((0, y, 0), (0, y + 0.3, 0), radius, TIMBER, sides=10)
    for i in range(8):
        a = i * TAU / 8
        tower.tube((3.5 * math.cos(a), 0, 3.5 * math.sin(a)),
                   (2.2 * math.cos(a), 11.8, 2.2 * math.sin(a)), 0.18, WOOD)
    tower.tube((0, 11.5, 0), (0, 16.7, 0), 3.1, TEAL, sides=10, end_radius=0.08)
    # Door, arch keystone, front window and wooden service balcony.
    tower.box((0, 1.8, 3.33), (1.75, 3.6, 0.20), WOOD)
    tower.orb((0, 3.45, 3.32), (0.85, 0.8, 0.16), WOOD)
    tower.box((0.48, 1.55, 3.48), (0.14, 0.14, 0.12), GOLD)
    tower.box((0, 7.3, 2.77), (1.05, 1.5, 0.12), INK)
    tower.box((0, 7.3, 2.86), (0.09, 1.6, 0.09), TIMBER)
    tower.box((0, 7.3, 2.86), (1.13, 0.09, 0.09), TIMBER)
    for i in range(9):
        tower.box((-3.2 + i * 0.8, 5.5, 2.2), (0.69, 0.22, 4.9), TIMBER)
    tower.tube((-3.5, 5.5, 4.4), (-3.5, 7.2, 4.4), 0.12, WOOD)
    tower.tube((3.5, 5.5, 4.4), (3.5, 7.2, 4.4), 0.12, WOOD)
    tower.tube((-3.5, 7.2, 4.4), (3.5, 7.2, 4.4), 0.1, TIMBER)
    tower.tube((0, 14, -0.1), (0, 14, 3.9), 0.53, WOOD, sides=10)
    rotor = Part("WindmillRotor", (-19, 14, -12))
    # Pivots are authored at local zero. Runtime may rotate this mesh around Z.
    for i in range(4):
        a = math.pi / 8 + i * math.pi / 2
        def r(x, y, z=4.1):
            return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), z)
        rotor.tube(r(0, 0), r(0, 11.1), 0.16, TIMBER)
        for row in range(5):
            y = 3.1 + row * 1.5
            # Sail panels flare outward and have visible gaps and ribbing.
            width = 1.0 + row * 0.18
            corners = [r(-0.1, y), r(width, y + 0.2), r(width + 0.2, y + 1.5), r(-0.1, y + 1.35)]
            back = [(x, yy, z - 0.10) for x, yy, z in corners]
            rotor.shape(corners + back, [(0, 1, 2, 3), (7, 6, 5, 4),
                        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                        CREAM if row % 2 else CLOTH)
            rotor.tube(r(-0.16, y + 0.03, 4.2), r(width + 0.2, y + 0.24, 4.2), 0.07, WOOD, sides=5)
    rotor.tube((0, 0, 3.8), (0, 0, 4.5), 0.95, TIMBER, sides=12)
    rotor.orb((0, 0, 4.58), (0.45, 0.45, 0.17), GOLD, sides=10, rings=4)
    return tower, rotor


def keeper():
    p = Part("Keeper", (8, 1.2, -2))
    for side in (-1, 1):
        p.box((side * 0.36, -0.98, 0.16), (0.51, 0.36, 0.86), WOOD)
        p.tube((side * 0.36, -0.85, 0), (side * 0.33, 0.25, 0), 0.22, INK, sides=7)
    p.tube((0, -0.05, 0), (0, 1.45, 0), 1.0, TEAL, sides=10, end_radius=0.59)
    p.orb((0, 1.68, 0.07), (0.67, 0.76, 0.62), CREAM, sides=12, rings=6)
    p.orb((-0.58, 1.63, 0), (0.19, 0.27, 0.20), CREAM, sides=7, rings=4)
    p.orb((0.58, 1.63, 0), (0.19, 0.27, 0.20), CREAM, sides=7, rings=4)
    p.orb((0, 1.52, 0.61), (0.16, 0.15, 0.21), (0.76, 0.46, 0.28), sides=7, rings=4)
    for side in (-1, 1):
        p.orb((side * 0.26, 1.84, 0.57), (0.10, 0.13, 0.045), INK, sides=7, rings=4)
        p.tube((side * 0.36, 1.33, 0.54), (side * 0.12, 1.25, 0.62), 0.035, WOOD, sides=5)
    p.tube((0, 2.13, 0), (0, 2.27, 0), 1.25, STRAW, sides=16)
    p.tube((0, 2.25, 0), (0, 2.85, 0), 0.71, CREAM, sides=12, end_radius=0.3)
    p.tube((0, 2.3, 0), (0, 2.47, 0), 0.66, CORAL, sides=12)
    p.leaf((0.5, 2.65, 0), (1.05, 3.1, 0), 0.15, TEAL)
    p.tube((-0.6, 1.1, 0), (-1.1, 0.4, 0.18), 0.26, TEAL, sides=8)
    p.orb((-1.1, 0.3, 0.18), (0.21, 0.28, 0.22), CREAM, sides=8, rings=4)
    p.tube((0.6, 1.1, 0), (1.15, 1.48, 0), 0.25, TEAL, sides=8)
    p.tube((1.15, 1.48, 0), (1.32, 2.14, 0.15), 0.19, TEAL, sides=8)
    p.orb((1.34, 2.24, 0.18), (0.21, 0.31, 0.17), CREAM, sides=8, rings=4)
    p.box((0, 1.03, 0.62), (0.48, 0.47, 0.14), CORAL)
    p.orb((0, 1.17, 0.73), (0.17, 0.17, 0.08), GOLD, sides=8, rings=4)
    return p


def decorations():
    lanterns, pennants = Part("Lanterns", glow=True), Part("Pennants")
    for x, z in ((-11.5, -12), (11.5, -12), (-14, 7), (14, 7)):
        lanterns.tube((x, 0, z), (x, 4.1, z), 0.11, WOOD)
        lanterns.orb((x, 3.55, z), (0.59, 0.85, 0.59), GOLD, sides=8, rings=4)
        lanterns.tube((x, 4.15, z), (x, 4.34, z), 0.65, CORAL, sides=8, end_radius=0.25)
        lanterns.tube((x, 2.72, z), (x, 2.92, z), 0.35, CORAL, sides=8)
    pennants.tube((-11.5, 7.6, -11.9), (0, 6.8, -11.8), 0.06, STRAW)
    pennants.tube((0, 6.8, -11.8), (11.5, 7.6, -11.9), 0.06, STRAW)
    for i in range(11):
        x = -10 + i * 2
        y = 6.8 + abs(x) * 0.069
        pennants.leaf((x, y, -11.8), (x + 0.15, y - 1.6, -11.8), 0.65, CORAL if i % 2 else GOLD)
    return lanterns, pennants


def secret_path():
    p = Part("SecretPath")
    # Keep the original approach stones. Its terminal tiny step is now a real
    # garden terrace; the old terminal arch would obstruct its landing center.
    for i in range(7):
        t = i / 7
        x, y, z = 20 + 40 * t, 8 * t, 5 + 35 * t + 4 * math.sin(t * math.pi)
        p.tube((x, y - 2, z), (x, y, z), 2.6, STONE, sides=7, end_radius=3.1)
        p.tube((x, y, z), (x, y + 0.12, z), 2.9, PAVING, sides=7)
        if i == 3:
            for side in (-1, 1):
                p.tube((x + side * 3.2, y, z), (x + side * 3, y + 5.3, z), 0.55, STONE, sides=7)
            for j in range(8):
                a, b = j * math.pi / 8, (j + 1) * math.pi / 8
                p.tube((x + 3 * math.cos(a), y + 5.3 + 2.3 * math.sin(a), z),
                       (x + 3 * math.cos(b), y + 5.3 + 2.3 * math.sin(b), z), 0.45, PAVING)
    x, y, z = GARDEN_CENTER
    # A tapered, layered islet and a continuous 10m landing footprint. Surface
    # is exactly local y=8, matching the gameplay pad's world y=14 contract.
    p.tube((x + 1.3, y - 12, z - 0.8), (x, y - 5.2, z), 2.0, STONE, sides=16, end_radius=9.2)
    p.tube((x, y - 5.2, z), (x, y - 0.6, z), 9.2, STONE, sides=20, end_radius=13.4)
    p.tube((x, y - 0.6, z), (x, y - 0.12, z), 13.4, CAP, sides=24, end_radius=13.3)
    p.tube((x, y - 0.15, z), (x, y, z), 11.3, PAVING, sides=32)
    for i in range(24):
        a = i * TAU / 24
        p.box((x + 11.9 * math.cos(a), y + 0.08, z + 11.9 * math.sin(a)),
              (1.9, 0.3, 0.7), CREAM, a + math.pi / 2)
    # A sheltered bower, lookout bench and winged seed relic give the newly
    # opened place a readable purpose. All solids stay outside radius 10.
    for side in (-1, 1):
        p.tube((x + side * 5.7, y, z + 10.8), (x + side * 5.5, y + 5.0, z + 10.8),
               0.33, TIMBER, sides=6, end_radius=0.22)
        p.tube((x + side * 5.5, y + 5.0, z + 10.8), (x, y + 6.7, z + 11.2), 0.25, TIMBER)
        p.box((x + side * 3.9, y + 0.7, z + 11.2), (3.8, 0.4, 0.9), TIMBER)
        p.box((x + side * 3.9, y + 1.4, z + 11.8), (3.8, 0.95, 0.25), WOOD)
        for i in range(4):
            p.leaf((x, y + 6.6, z + 9.9 + i * 0.65),
                   (x + side * 6.5, y + 4.6, z + 10.2 + i * 0.65), 0.6, TEAL, 0.18)
    p.tube((x, y, z + 11.5), (x, y + 1.1, z + 11.5), 1.15, STONE, sides=8, end_radius=0.9)
    p.orb((x, y + 2.0, z + 11.5), (0.55, 1.0, 0.48), GOLD, sides=8, rings=4)
    for side in (-1, 1):
        p.leaf((x + side * 0.1, y + 1.8, z + 11.5),
               (x + side * 2.3, y + 3.15, z + 11.5), 0.43, CREAM)
    # The approach arch is on the southwest rim, not over the landing center.
    for side in (-1, 1):
        p.tube((x - 8.3 + side * 2.3, y, z - 8.3 - side * 2.3),
               (x - 8.3 + side * 2.3, y + 4.6, z - 8.3 - side * 2.3), 0.35, STONE)
    p.tube((x - 10.6, y + 4.6, z - 6.0), (x - 8.3, y + 6.0, z - 8.3), 0.33, PAVING)
    p.tube((x - 8.3, y + 6.0, z - 8.3), (x - 6.0, y + 4.6, z - 10.6), 0.33, PAVING)
    # Sparse broad-leaf plants and coral blooms distinguish this living place
    # from the stone route. Merged vertex-color geometry adds no material slot.
    for i in range(10):
        a = -0.35 + i * 0.31
        px, pz = x + 12.1 * math.cos(a), z + 12.1 * math.sin(a)
        p.tube((px, y - 0.1, pz), (px, y + 1.9, pz), 0.1, TIMBER, sides=5)
        for side in (-1, 1):
            p.leaf((px, y + 0.55, pz), (px + side * 0.7, y + 1.7, pz), 0.33, TEAL)
        p.orb((px, y + 1.9, pz), (0.44, 0.36, 0.4), CORAL if i % 3 else GOLD, sides=6, rings=3)
    return p


def templates():
    perch = Part("BirdPerch")
    perch.tube((0, -3, 0), (0, -1.0, 0), 0.45, STONE, sides=7, end_radius=2.1)
    perch.tube((0, -1, 0), (0, -0.8, 0), 2.1, CAP, sides=7, end_radius=1.85)
    bird = Part("Bird")
    bird.orb((0, 0, 0), (0.55, 0.62, 0.82), CREAM, sides=10, rings=5)
    bird.orb((0, 0.53, 0.4), (0.46, 0.44, 0.46), CLOTH, sides=10, rings=5)
    bird.tube((0, 0.48, 0.72), (0, 0.42, 1.1), 0.17, GOLD, sides=5, end_radius=0.03)
    for side in (-1, 1):
        bird.orb((side * 0.27, 0.64, 0.72), (0.07, 0.09, 0.06), INK, sides=6, rings=3)
        for i in range(3):
            bird.leaf((side * 0.42, 0.15, -0.2 + i * 0.24),
                      (side * (1.2 + 0.12 * i), 0.05 - i * 0.14, -0.28 + i * 0.15), 0.21, TEAL)
        bird.tube((side * 0.2, -0.4, 0.2), (side * 0.2, -0.77, 0.24), 0.055, GOLD, sides=5)
    for i in range(3):
        bird.leaf(((i - 1) * 0.15, -0.1, -0.55), ((i - 1) * 0.28, 0.12, -1.5), 0.16, TEAL)
    relay = Part("RelayDevice")
    relay.tube((0, -1.4, 0), (0, -0.5, 0), 1.4, STONE, sides=8, end_radius=1.1)
    relay.tube((0, -0.55, 0), (0, 0.3, 0), 0.52, TIMBER, sides=8)
    for side in (-1, 1):
        relay.tube((side * 1.0, -0.35, 0), (side * 1.0, 1.1, 0), 0.18, GOLD, sides=6)
    for i in range(12):
        a, b = i * TAU / 12, (i + 1) * TAU / 12
        relay.tube((0.78 * math.cos(a), 0.6 + 0.78 * math.sin(a), 0),
                   (0.78 * math.cos(b), 0.6 + 0.78 * math.sin(b), 0), 0.12, TEAL, sides=5)
    relay.leaf((0, 0, 0.05), (0, 1.2, 0.05), 0.3, GOLD)
    relic = Part("Relic", glow=True)
    relic.tube((0, -0.8, 0), (0, -0.35, 0), 1.35, STONE, sides=6)
    relic.orb((0, 0.6, 0), (0.65, 1.1, 0.65), GOLD, sides=6, rings=3)
    for side in (-1, 1):
        relic.leaf((side * 0.25, 0.1, 0), (side * 1.5, 1.45, 0), 0.34, CREAM)
    charm = Part("Charm", glow=True)
    charm.orb((0, 0, 0), (0.22, 0.28, 0.11), GOLD, sides=8, rings=4)
    for side in (-1, 1):
        charm.leaf((side * 0.05, 0, 0), (side * 0.7, 0.42, 0), 0.18, CREAM)
        charm.leaf((side * 0.08, -0.1, 0), (side * 0.3, -0.88, 0), 0.13, CORAL)
    return bird, perch, relay, relic, charm


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Only this new source file is saved; do not touch the earlier authored art.
    bpy.context.preferences.filepaths.save_version = 0
    root = bpy.data.objects.new("AdventureRoot", None)
    bpy.context.scene.collection.objects.link(root)
    for key, value in {
        "asset_license": "project-authored", "asset_version": "0.46",
        "geometry_style": "handcrafted-nest-and-windmill", "landing_radius": 14.0,
        "world_anchor_y_up": [-82.0, 6.0, 30.0],
        "secret_garden_local_y_up": GARDEN_CENTER,
        "secret_garden_world_y_up": [-22.0, 14.0, 70.0],
        "secret_garden_landing_radius": GARDEN_RADIUS,
        "authoring_source": "tools/blender/build_adventure_hub.py",
        "runtime_templates": "Bird,BirdPerch,RelayDevice,Relic,Charm",
    }.items():
        root[key] = value
    materials = (material("M_Adventure_Surface"), material("M_Adventure_Glow", True))
    parts = [terrain(), nest(), *windmill(), keeper(), *decorations(), secret_path(), *templates()]
    objects = [part.finish(root, materials) for part in parts]
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True,
                              export_yup=True, export_extras=True, export_animations=False,
                              export_cameras=False, export_lights=False, export_apply=True,
                              export_materials="EXPORT", export_normals=True,
                              export_texcoords=False, export_tangents=False)
    triangles = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    data = OUTPUT.read_bytes()
    print("ADVENTURE_BUILD=" + json.dumps({"source": str(SOURCE), "glb": str(OUTPUT),
          "triangles": triangles, "meshes": len(objects), "materials": len(materials),
          "bytes": len(data), "gzip9_bytes": len(gzip.compress(data, 9, mtime=0))}))


if __name__ == "__main__":
    main()
