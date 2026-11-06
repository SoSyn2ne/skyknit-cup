"""Art V2 sanctuary: authored geometry, bounded semantic meshes, no textures.

Design coordinates are Three.js Y-up. All old M46 outputs remain untouched.
Run Blender 4.5 --background --threads 2 --python-exit-code 1 --python this file.
"""

from __future__ import annotations

import gzip
import json
import math
import random
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_adventure_hub import Part, xyz, material, keeper, templates

ROOT = HERE.parents[1]
SOURCE = ROOT / "assets/source/art-v2/hub-v2.blend"
OUT = ROOT / "artifacts/art-v2"
GLB = OUT / "hub-v2.glb"
TAU = math.tau
RNG = random.Random(460207)
ROCK = (0.48, 0.40, 0.29)
ROCK_LIGHT = (0.66, 0.57, 0.42)
MORTAR = (0.31, 0.29, 0.22)
PAVING = (0.65, 0.56, 0.40)
WOOD = (0.25, 0.115, 0.042)
TIMBER = (0.47, 0.25, 0.082)
STRAW = (0.68, 0.43, 0.13)
CREAM = (0.94, 0.78, 0.47)
RED = (0.60, 0.105, 0.047)
GOLD = (0.95, 0.52, 0.10)
TEAL = (0.045, 0.22, 0.19)
GRASS = (0.22, 0.34, 0.060)
LEAF = (0.18, 0.30, 0.06)
INK = (0.035, 0.047, 0.038)


def tint(c, f):
    return tuple(min(1, max(0, x * f)) for x in c)


def stroke(part, points, radius, color, sides=5, taper=0.7):
    for i in range(len(points) - 1):
        part.tube(points[i], points[i + 1], radius * (1 - (1 - taper) * i / len(points)),
                  color, sides=sides,
                  end_radius=radius * (1 - (1 - taper) * (i + 1) / len(points)))


def stone(part, center, scale, color, seed):
    """Irregular beveled prism, not a stack of identically scaled spheres."""
    rand = random.Random(seed)
    x, y, z = center
    sx, sy, sz = scale
    n = 7
    vertices = []
    for level, shrink in ((-1, 0.75), (-0.72, 1), (0.67, 0.95), (1, 0.68)):
        for i in range(n):
            a = TAU * i / n + 0.1
            rad = shrink * rand.uniform(0.86, 1.08)
            vertices.append((x + sx * rad * math.cos(a), y + sy * level,
                             z + sz * rad * math.sin(a)))
    faces = [tuple(reversed(range(n))), tuple(range(n * 3, n * 4))]
    for row in range(3):
        for i in range(n):
            a, b = row * n + i, row * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    part.shape(vertices, faces, color)


def island(part, center, rx, rz, depth, seed, cap_color=GRASS):
    rand = random.Random(seed)
    x, y, z = center
    n = 30
    outline = [1 + rand.uniform(-0.12, 0.13) for _ in range(n)]
    levels = [(0, 1), (-0.07, 1.04), (-0.25, 0.87), (-0.44, 0.81),
              (-0.65, 0.54), (-0.86, 0.25)]
    vertices = [(x, y, z)]
    for row, (height, scale) in enumerate(levels):
        for i in range(n):
            a = TAU * i / n
            jitter = 1 if row == 0 else rand.uniform(0.91, 1.1)
            vertices.append((x + rx * outline[i] * scale * math.cos(a) * jitter,
                             y + depth * height,
                             z + rz * outline[i] * scale * math.sin(a) * jitter))
    vertices.append((x + rx * 0.08, y - depth, z - rz * 0.12))
    part.shape(vertices, [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)], cap_color)
    for row in range(len(levels) - 1):
        faces = []
        for i in range(n):
            a, b = 1 + row * n + i, 1 + row * n + (i + 1) % n
            faces.extend([(a, b, b + n), (a, b + n, a + n)])
        part.shape(vertices, faces, tint(ROCK, 0.84 + row * 0.05))
    last = 1 + (len(levels) - 1) * n
    part.shape(vertices, [(len(vertices) - 1, last + i, last + (i + 1) % n)
                          for i in range(n)], tint(ROCK, 0.7))
    # Split color bands are open shells; retain their explicit outward winding.
    part.preserve_winding_faces = len(part.faces)


def terrain():
    p = Part("Terrain")
    island(p, (0, -0.36, -5), 32, 35, 42, 1)
    for i in range(24):
        a = TAU * i / 24
        # Broad interlocking strata stay below the inhabited surface. Tall
        # radial pillars used to protrude through the nest and obscure it.
        r = 1 + 0.08 * math.sin(i * 3.7)
        for layer in range(3):
            rr = r * (1 - layer * 0.045)
            aa = a + layer * 0.045
            stone(p, (29 * rr * math.cos(aa), -3.2 - layer * 4.2 - i % 3 * 0.35,
                      -5 + 32 * rr * math.sin(aa)),
                  (4.1 + i % 3 * 0.45, 1.9 + (i + layer) % 3 * 0.28, 4.6),
                  tint(ROCK_LIGHT, 0.82 + (i + layer) % 4 * 0.07), 100 + i * 3 + layer)
    for i in range(15):
        a = 0.2 + TAU * i / 15
        stone(p, (19.5 * math.cos(a), -21 - i % 4, -5 + 21 * math.sin(a)),
              (4, 6 + i % 5, 4), tint(ROCK, 0.8 + i % 4 * 0.05), 300 + i)
    # Pavers have exact y=0 tops. Continuous mortar supports their hairline
    # joints 1cm lower, inside the existing 1.5cm landing-plane tolerance.
    p.tube((0, -0.5, 0), (0, -0.010, 0), 14.9, tint(PAVING, 0.63), sides=64)
    for row in range(-5, 6):
        for col in range(-5, 6):
            x, z = col * 2.5 + (row % 2) * 1.25, row * 2.5
            if math.hypot(x, z) < 12.3:
                p.box((x, -0.009, z), (2.41, 0.018, 2.41),
                      tint(PAVING, RNG.uniform(0.82, 1.13)))
    for i in range(40):
        a = TAU * i / 40
        p.box((14.2 * math.cos(a), -0.011, 14.2 * math.sin(a)),
              (2.15, 0.022, 1.15), tint(CREAM, 0.84 + (i % 3) * 0.035), a + math.pi / 2)
    return p


def arch(p, x, y, z, width=3.0, height=5.2):
    for side in (-1, 1):
        for row in range(6):
            p.box((x + side * width, y + 0.44 + row * 0.86, z),
                  (1.05, 0.82, 1.30), tint(ROCK_LIGHT, 0.96 + row % 3 * 0.04))
        p.box((x + side * width, y + height, z), (1.4, 0.45, 1.55), CREAM)
    for i in range(11):
        a, b = i * math.pi / 11, (i + 1) * math.pi / 11
        verts = []
        for zz in (z - 0.65, z + 0.65):
            verts.extend([(x + rr * math.cos(t), y + height + rr * math.sin(t), zz)
                          for rr, t in ((width - 0.5, a + 0.025), (width + 0.52, a + 0.025),
                                        (width + 0.52, b - 0.025), (width - 0.5, b - 0.025))])
        p.shape(verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                tint(ROCK_LIGHT, 0.9 + i % 3 * 0.09))


def terraces():
    p = Part("Terraces")
    # Side terraces are separate from the landing disk and its approach.
    p.box((19, 1.4, -21.5), (15, 3.6, 18), ROCK)
    p.box((19, 3.25, -21.5), (15.3, 0.3, 18.3), GRASS)
    for row in range(4):
        for i in range(12):
            p.box((11.8 + i * 1.31, row * 0.86, -12.55),
                  (1.23, 0.79, 0.38), tint(ROCK_LIGHT, RNG.uniform(0.85, 1.08)))
    for i in range(10):
        y, z = 0.34 * i, -8.5 - i * 0.73
        p.box((21.5, y - 0.18, z), (4.4, 0.40, 0.89), tint(PAVING, 1 + i % 2 * 0.08))
        for side in (-1, 1):
            p.box((21.5 + side * 2.5, y + 0.12, z), (0.60, 0.68, 0.86), ROCK_LIGHT)
    arch(p, 20.5, 3.4, -22.7)
    # Low rope guardrail leaves an eight metre approach opening at front.
    for side in (-1, 1):
        points = []
        for i in range(6):
            a = math.radians(18 + i * 11)
            x, z = side * 18.7 * math.cos(a), 18.7 * math.sin(a)
            p.tube((x, -0.25, z), (x, 1.65, z), 0.20, WOOD, sides=7)
            p.orb((x, 1.67, z), (0.26, 0.18, 0.26), TIMBER, sides=6, rings=3)
            points.append((x, 1.3, z))
        for a, b in zip(points[:-1], points[1:]):
            mid = tuple((x + y) / 2 for x, y in zip(a, b))
            stroke(p, [a, (mid[0], mid[1] - 0.25, mid[2]), b], 0.07, STRAW)
    # Provisions beside the side paths, away from the player flight surface.
    for x, z, s in ((16, 7, 1), (18, 5.6, 0.8), (-15.4, 10, 0.75)):
        p.box((x, s, z), (1.8 * s, 2 * s, 1.8 * s), TIMBER)
        for yy in (0.3, 1.7):
            p.box((x, yy * s, z + 0.93 * s), (1.95 * s, 0.18, 0.12), WOOD)
        for xx in (-0.65, 0.65):
            p.box((x + xx * s, s, z + 0.94 * s), (0.17, 1.8 * s, 0.11), WOOD)
    return p


def nest():
    p = Part("Nest")
    cx, cz = 1.5, -25.5
    # Layered basket follows long irregular branch curves, not torus rings.
    for layer in range(7):
        for k in range(11):
            angle = k * TAU / 11 + layer * 0.25
            sweep = 0.75 + RNG.random() * 0.38
            points = []
            for j in range(8):
                a = angle + sweep * j / 7
                rad = 8.7 + 0.17 * layer + 0.23 * math.sin(a * 7 + layer)
                points.append((cx + rad * math.cos(a), 0.6 + layer * 0.39 + 0.16 * math.sin(a * 3),
                               cz + rad * 0.70 * math.sin(a)))
            stroke(p, points, 0.21, tint(STRAW if (k + layer) % 3 else TIMBER,
                                       0.88 + RNG.random() * 0.18), sides=5)
    # Interwoven uprights tie the basket wall together.
    for i in range(24):
        a = TAU * i / 24
        points = [(cx + (8.65 + j * 0.28) * math.cos(a + math.sin(j) * 0.03),
                   0.5 + j * 0.70, cz + (6.05 + j * 0.20) * math.sin(a)) for j in range(5)]
        stroke(p, points, 0.18, tint(TIMBER, 1.1), sides=5)
    p.orb((cx, 0.48, cz), (8.4, 0.30, 5.6), tint(STRAW, 0.70), sides=24, rings=4)
    for i in range(22):
        a = TAU * i / 22
        stroke(p, [(cx + 1.5 * math.cos(a), 0.78, cz + math.sin(a)),
                   (cx + 4 * math.cos(a + 0.17), 0.84, cz + 3 * math.sin(a)),
                   (cx + 7.4 * math.cos(a + 0.25), 0.87, cz + 4.5 * math.sin(a))], 0.08, CREAM)
    # A textile shelter covers the rear half; the front lip and bed remain legible.
    peak = (cx, 11.6, cz - 1)
    for i in range(8):
        a = TAU * i / 8
        x, z = cx + 10.4 * math.cos(a), cz - 1 + 7.5 * math.sin(a)
        if i not in (1, 2, 3):
            p.tube((x, 0.0, z), (x, 6.4, z), 0.24, WOOD, sides=7, end_radius=0.17)
        stroke(p, [peak, ((peak[0] + x) / 2, 7.7, (peak[2] + z) / 2), (x, 6.4, z)],
               0.10, GOLD, sides=5)
        a1 = TAU * (i + 1) / 8
        vertices = []
        # Radial patch with curved hanging fabric and a slight scalloped edge.
        for row in range(5):
            t = row / 4
            rr = 0.06 + 0.94 * t
            for col in range(5):
                angle = a + (a1 - a) * col / 4
                yy = 11.6 - 5.2 * (rr ** 0.57) - 0.20 * math.sin(col * math.pi / 4) * rr
                vertices.append((cx + 10.4 * rr * math.cos(angle), yy,
                                 cz - 1 + 7.5 * rr * math.sin(angle)))
        faces = []
        for row in range(4):
            for col in range(4):
                k = row * 5 + col
                faces.append((k, k + 1, k + 6, k + 5))
        p.shape(vertices, faces, RED if i % 2 else CREAM)
    p.tube((cx, 10.8, cz - 1), (cx, 12.8, cz - 1), 0.14, TIMBER)
    p.orb((cx, 12.9, cz - 1), (0.33, 0.45, 0.33), GOLD, sides=8, rings=4)
    return p


def wall_window(p, angle, y, radius, width=0.7, height=1.3):
    def q(x, yy, z):
        return (x * math.cos(angle) + z * math.sin(angle), yy,
                -x * math.sin(angle) + z * math.cos(angle))
    p.box(q(0, y, radius), (width, height, 0.10), INK, -angle)
    for x in (-width / 2 - 0.1, width / 2 + 0.1):
        p.box(q(x, y, radius + 0.10), (0.18, height + 0.26, 0.22), TIMBER, -angle)
    for yy in (-height / 2 - 0.08, height / 2 + 0.08, 0):
        p.box(q(0, y + yy, radius + 0.16), (width + 0.33, 0.15, 0.25), WOOD, -angle)
    p.box(q(0, y, radius + 0.18), (0.09, height, 0.16), STRAW, -angle)


def windmill():
    tower = Part("WindmillTower", (-19, 0, -12))
    tower.tube((0, -0.35, 0), (0, 1.0, 0), 5.2, MORTAR, sides=16, end_radius=4.9)
    tower.tube((0, 0.6, 0), (0, 11.4, 0), 4.3, tint(CREAM, 0.8), sides=16, end_radius=3.05)
    # Alternating masonry courses, with wide plaster quiet zones above.
    for row in range(10):
        rr = 4.32 - row * 0.09
        for i in range(19):
            a = TAU * (i + (row % 2) * 0.5) / 19
            # Door opening is left clear of projecting stones.
            if row < 4 and abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.30:
                continue
            if row > 4 and (i + row) % 3:
                continue
            tower.box((rr * math.cos(a), 0.65 + row * 0.75, rr * math.sin(a)),
                      (1.18, 0.68, 0.34), tint(ROCK_LIGHT, RNG.uniform(0.87, 1.13)), a - math.pi / 2)
    # Door leaves, iron straps, shallow arch stones and clear windows.
    tower.box((0, 1.9, 4.33), (1.75, 3.6, 0.16), WOOD)
    for i in range(5):
        tower.box((-0.72 + i * 0.36, 1.88, 4.44), (0.30, 3.45, 0.11), tint(TIMBER, 0.9 + i % 2 * 0.15))
    for y in (0.65, 2.95):
        tower.box((0, y, 4.53), (1.7, 0.13, 0.13), INK)
    tower.orb((0.47, 1.65, 4.61), (0.11, 0.13, 0.10), GOLD, sides=8, rings=4)
    for i in range(9):
        a = math.pi * i / 8
        tower.box((1.1 * math.cos(a), 3.45 + 1.1 * math.sin(a), 4.34),
                  (0.48, 0.45, 0.42), ROCK_LIGHT)
    for angle in (0, math.pi / 2, math.pi, -math.pi / 2):
        wall_window(tower, angle, 6.1, 3.80, 0.82, 1.50)
    # Timber-framed top storey, collar and wraparound service balcony.
    tower.tube((0, 10.6, 0), (0, 16.3, 0), 3.55, CREAM, sides=12, end_radius=3.45)
    for y in (10.7, 13.6, 16.1):
        tower.tube((0, y, 0), (0, y + 0.24, 0), 3.65, WOOD, sides=12)
    for i in range(12):
        a = TAU * i / 12
        tower.tube((3.59 * math.cos(a), 10.8, 3.59 * math.sin(a)),
                   (3.5 * math.cos(a), 16.15, 3.5 * math.sin(a)), 0.14, WOOD, sides=5)
        b = a + TAU / 12
        tower.tube((3.60 * math.cos(a), 10.8, 3.60 * math.sin(a)),
                   (3.56 * math.cos(b), 13.5, 3.56 * math.sin(b)), 0.10, TIMBER, sides=5)
        if i % 3 == 0:
            wall_window(tower, a, 14.7, 3.59, 0.65, 1.05)
    for i in range(36):
        a = TAU * i / 36
        tower.box((4 * math.cos(a), 10.58, 4 * math.sin(a)), (1.35, 0.19, 0.79), TIMBER, a)
        if i % 3 == 0:
            tower.tube((4.65 * math.cos(a), 10.7, 4.65 * math.sin(a)),
                       (4.65 * math.cos(a), 12.05, 4.65 * math.sin(a)), 0.11, WOOD)
            tower.tube((4.65 * math.cos(a), 12.05, 4.65 * math.sin(a)),
                       (4.65 * math.cos(a + TAU / 12), 12.05, 4.65 * math.sin(a + TAU / 12)), 0.09, TIMBER)
    # Individual overlapping shingles form a tapered, slightly concave roof.
    for row in range(8):
        y0 = 16.25 + row * 0.63
        r0 = 5.05 * (1 - row / 9) ** 1.25
        r1 = 5.05 * (1 - (row + 1.17) / 9) ** 1.25
        count = max(12, 32 - row * 2)
        for i in range(count):
            a = TAU * (i + (row % 2) * 0.5) / count
            b = a + TAU / count * 0.97
            v = [(r0 * math.cos(a), y0, r0 * math.sin(a)),
                 (r0 * math.cos(b), y0, r0 * math.sin(b)),
                 (r1 * math.cos(b), y0 + 0.79, r1 * math.sin(b)),
                 (r1 * math.cos(a), y0 + 0.79, r1 * math.sin(a))]
            v += [(x, y - 0.16, z) for x, y, z in v]
            tower.shape(v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                            (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                        tint(RED, RNG.uniform(0.72, 1.28)))
    tower.tube((0, 21.1, 0), (0, 22.8, 0), 0.34, TEAL, sides=10, end_radius=0.06)
    tower.tube((0, 22.6, 0), (0, 24, 0), 0.07, GOLD)
    tower.leaf((0, 23.6, 0), (1.8, 23.8, 0), 0.40, GOLD)
    tower.tube((0, 14, 0), (0, 14, 5.15), 0.41, WOOD, sides=12)

    rotor = Part("WindmillRotor", (-19, 14, -12))
    for i in range(4):
        a = math.radians(18) + i * math.pi / 2
        def q(x, y, z=5.35):
            return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), z)
        rotor.tube(q(0, 0), q(0, 12.6), 0.17, WOOD, sides=7, end_radius=0.11)
        rotor.tube(q(0, 3), q(3.45, 12.45), 0.12, TIMBER, sides=6)
        for row in range(7):
            y0, y1 = 3 + row * 1.32, 3 + (row + 1) * 1.32
            w0, w1 = 0.46 + row * 0.42, 0.46 + (row + 1) * 0.42
            vertices = []
            for iy in range(3):
                t = iy / 2
                for ix in range(5):
                    u = ix / 4
                    w = w0 + (w1 - w0) * t
                    vertices.append(q(0.12 + w * u, y0 + (y1 - y0) * t,
                                      5.36 + 0.18 * math.sin(u * math.pi)))
            faces = []
            for iy in range(2):
                for ix in range(4):
                    k = iy * 5 + ix
                    faces.append((k, k + 1, k + 6, k + 5))
            rotor.shape(vertices, faces, tint(CREAM, 0.90 + row % 3 * 0.04))
            rotor.tube(q(-0.14, y0, 5.45), q(w0 + 0.2, y0, 5.45), 0.07, TIMBER, sides=5)
        rotor.tube(q(0, 12.3, 5.47), q(3.6, 12.3, 5.47), 0.08, TIMBER)
        stroke(rotor, [q(0, 1, 5.6), q(3.45, 12.3, 5.6), q(0, 12.5, 5.6)], 0.035, STRAW)
    rotor.tube((0, 0, 4.95), (0, 0, 5.8), 0.78, TIMBER, sides=14)
    rotor.tube((0, 0, 5.8), (0, 0, 5.99), 0.54, GOLD, sides=12)
    for i in range(8):
        a = TAU * i / 8
        rotor.orb((0.6 * math.cos(a), 0.6 * math.sin(a), 5.85), (0.06, 0.06, 0.06), INK, sides=5, rings=3)
    return tower, rotor


def plant(p, x, y, z, scale, seed, flower=False):
    rand = random.Random(seed)
    for i in range(5):
        a = i * TAU / 5 + rand.random() * 0.4
        h = scale * rand.uniform(0.6, 1)
        p.leaf((x, y, z), (x + math.cos(a) * h * 0.7, y + h, z + math.sin(a) * h * 0.7),
               h * 0.20, tint(LEAF, rand.uniform(0.8, 1.3)), 0.04)
    if flower:
        p.tube((x, y, z), (x, y + scale * 1.25, z), 0.025 * scale, LEAF, sides=4)
        for i in range(5):
            a = TAU * i / 5
            p.leaf((x, y + scale * 1.25, z),
                   (x + math.cos(a) * scale * 0.26, y + scale * 1.4, z + math.sin(a) * scale * 0.26),
                   scale * 0.12, GOLD if seed % 2 else (0.67, 0.21, 0.21), 0.03)


def tree(p, x, y, z, scale, seed):
    rand = random.Random(seed)
    stroke(p, [(x, y, z), (x + 0.4 * scale, y + 3.0 * scale, z),
               (x + 0.1 * scale, y + 5.0 * scale, z - 0.4 * scale),
               (x + 0.6 * scale, y + 7 * scale, z)], 0.54 * scale, WOOD, sides=8, taper=0.35)
    for i in range(7):
        a = TAU * i / 7
        end = (x + math.cos(a) * 2.6 * scale, y + (5.5 + rand.random() * 1.8) * scale,
               z + math.sin(a) * 2.6 * scale)
        stroke(p, [(x + 0.2 * scale, y + 3.8 * scale, z),
                   ((x + end[0]) / 2, end[1] - scale, (z + end[2]) / 2), end],
               scale * 0.27, TIMBER, sides=6, taper=0.25)
        for j in range(3):
            center = (end[0] + rand.uniform(-1.0, 1.0) * scale,
                      end[1] + rand.uniform(-0.2, 1.2) * scale,
                      end[2] + rand.uniform(-1.0, 1.0) * scale)
            p.orb(center, (1.6 * scale, 1.2 * scale, 1.6 * scale),
                  tint(LEAF, rand.uniform(0.8, 1.35)), sides=8, rings=4)


def foliage_leaf(p, start, end, width, color, outward):
    """Six-triangle ridged blade; shared double-sided foliage material."""
    a, b, normal = Vector(start), Vector(end), Vector(outward)
    side = (b - a).cross(normal).normalized() * width
    rim = [a, a.lerp(b, 0.27) + side * 0.8, a.lerp(b, 0.64) + side,
           b, a.lerp(b, 0.64) - side, a.lerp(b, 0.27) - side * 0.8]
    vertices = [tuple(v) for v in rim] + [tuple(a.lerp(b, 0.51) + normal * width * 0.24)]
    p.shape(vertices, [(i, (i + 1) % 6, 6) for i in range(6)], color)


def greenery():
    p = Part("Greenery")
    tree(p, 27, 3.4, -28, 1.25, 8)
    tree(p, -26, -0.25, -29, 0.95, 10)
    tree(p, 26, -0.25, 1, 0.90, 12)
    for i in range(82):
        a = RNG.random() * TAU
        rr = RNG.uniform(18.8, 26.8)
        x, z = rr * math.cos(a), -2 + rr * math.sin(a)
        # Keep architecture, side stair, and nesting bed clear.
        if z < -12 or (x > 18 and z < 0):
            continue
        plant(p, x, -0.25, z, RNG.uniform(0.5, 1.3), i, flower=i % 3 == 0)
    for i in range(22):
        x, z = 13 + RNG.random() * 14, -17 - RNG.random() * 12
        if abs(x - 20.5) < 4 and abs(z + 22.7) < 2:
            continue
        plant(p, x, 3.4, z, RNG.uniform(0.65, 1.4), 120 + i, flower=i % 2 == 0)
    # Dense low shrubs connect the architecture to the ground without
    # intruding into the 14m landing pad or the right-hand stair.
    for i, (x, z, y) in enumerate(((-20, 7, -0.25), (-23, -4, -0.25),
                                  (-18, 15, -0.25), (-9, 22, -0.25),
                                  (8, 23, -0.25), (16, 19, -0.25),
                                  (25, 9, -0.25), (10, -16, -0.25),
                                  (13, -28, 3.4), (25, -18, 3.4))):
        for j in range(4):
            a = TAU * j / 4 + i * 0.8
            p.orb((x + math.cos(a) * 0.8, y + 0.55 + j % 2 * 0.3,
                   z + math.sin(a) * 0.7), (1.2, 0.9, 1.1),
                  tint(LEAF, 0.83 + j * 0.12), sides=7, rings=3)
        plant(p, x, y + 0.8, z, 0.85, 940 + i, flower=True)
        for j in range(6):
            a = TAU * j / 6 + i
            foliage_leaf(p, (x, y + 0.65, z),
                         (x + math.cos(a) * 1.9, y + 0.7 + j % 3 * 0.22,
                          z + math.sin(a) * 1.9), 0.36,
                         tint(LEAF, 0.93 + j % 3 * 0.14), (0, 1, 0))
    # Follow the same seeded top outline as Terrain. The old constant-radius
    # vines were buried inside protruding cliff bands and never reached view.
    rim_rng = random.Random(1)
    rim = [1 + rim_rng.uniform(-0.12, 0.13) for _ in range(30)]
    for i in range(20):
        k = int(i * 30 / 20)
        a = TAU * k / 30
        x, z = 32 * rim[k] * math.cos(a), 35 * rim[k] * math.sin(a)
        rand = random.Random(1600 + i)
        # Uneven roots and a shorter offshoot make connected foliage masses,
        # rather than flat disks followed by evenly spaced mirrored leaves.
        for j in range(3):
            p.orb((x * 0.985 - math.sin(a) * (j - 1) * 0.8,
                   -0.12 + j % 2 * 0.22,
                   -5 + z * 0.985 + math.cos(a) * (j - 1) * 0.8),
                  (1.15, 0.65 + j % 2 * 0.20, 1.08),
                  tint(LEAF, 0.86 + j * 0.12), sides=7, rings=3)
        for branch in range(2):
            points = []
            count = 8 + i % 3 if branch == 0 else 4 + i % 2
            for j in range(count):
                radial = 1.02 if j == 0 else 1.10 - j * 0.022
                offset = branch * 0.75 + math.sin(j * 0.7 + i) * 0.35
                points.append((x * radial - math.sin(a) * offset,
                               -0.25 - j * 1.15, -5 + z * radial + math.cos(a) * offset))
            stroke(p, points, 0.085, tint(LEAF, 0.72), sides=4)
            for j, (px, py, pz) in enumerate(points[1:]):
                for side in (-1, 1):
                    if rand.random() < 0.14:
                        continue
                    dx, dz = -math.sin(a) * side, math.cos(a) * side
                    length = rand.uniform(0.75, 1.6)
                    foliage_leaf(p, (px, py, pz),
                                 (px + dx * length, py - rand.uniform(0.65, 1.2), pz + dz * length),
                                 rand.uniform(0.38, 0.62),
                                 tint(LEAF, rand.uniform(0.8, 1.27)),
                                 (math.cos(a), 0, math.sin(a)))
    return p


def decorations():
    lanterns, pennants = Part("Lanterns", glow=True), Part("Pennants")
    for x, z, base in ((-16, 5, 0), (16.5, 4, 0), (-9, -18, 0), (12, -21, 3.4), (25, -14, 3.4)):
        lanterns.tube((x, base, z), (x, base + 4.3, z), 0.14, WOOD, sides=7)
        lanterns.tube((x, base + 4.1, z), (x + 0.8, base + 4.1, z), 0.12, TIMBER)
        lanterns.tube((x + 0.75, base + 4.1, z), (x + 0.75, base + 3.6, z), 0.045, INK)
        lanterns.box((x + 0.75, base + 3.1, z), (0.58, 0.91, 0.58), GOLD)
        for xx in (-0.33, 0.33):
            for zz in (-0.33, 0.33):
                lanterns.tube((x + 0.75 + xx, base + 2.62, z + zz),
                              (x + 0.75 + xx, base + 3.6, z + zz), 0.06, WOOD, sides=5)
        lanterns.tube((x + 0.75, base + 3.55, z), (x + 0.75, base + 3.85, z),
                      0.60, INK, sides=4, end_radius=0.08)
        lanterns.box((x + 0.75, base + 2.58, z), (0.80, 0.16, 0.80), INK)
    for side in (-1, 1):
        x, z = side * 17, -3
        pennants.tube((x, -0.1, z), (x, 5.8, z), 0.14, WOOD)
        pennants.tube((x - 0.8, 5.5, z), (x + 0.8, 5.5, z), 0.08, STRAW)
        v = [(x - 0.62, 5.38, z), (x + 0.62, 5.38, z), (x + 0.62, 3, z + 0.17),
             (x, 3.45, z + 0.25), (x - 0.62, 3, z + 0.17)]
        pennants.shape(v, [(0, 1, 2, 3, 4)], RED)
        pennants.leaf((x, 4.9, z + 0.04), (x, 3.9, z + 0.2), 0.26, GOLD, 0.025)
        pennants.orb((x, 5.85, z), (0.2, 0.3, 0.2), GOLD, sides=6, rings=3)
    return lanterns, pennants


def secret_path():
    p = Part("SecretPath")
    for i in range(7):
        t = i / 7
        x, y, z = 23 + 37 * t, 8 * t, 9 + 31 * t + 4 * math.sin(t * math.pi)
        island(p, (x, y, z), 2.5, 3.0, 5, 600 + i, PAVING)
    island(p, (60, 7.85, 40), 13.7, 14.0, 20, 750, GRASS)
    p.tube((60, 7.7, 40), (60, 8, 40), 10.65, PAVING, sides=48)
    for i in range(28):
        a = TAU * i / 28
        p.box((60 + 11.2 * math.cos(a), 8.0, 40 + 11.2 * math.sin(a)),
              (2, 0.3, 0.7), CREAM, a + math.pi / 2)
    arch(p, 60, 8, 51.8, 3, 4.5)
    for i in range(16):
        a = -0.1 + i * TAU / 16
        plant(p, 60 + 12.7 * math.cos(a), 8, 40 + 12.7 * math.sin(a),
              0.75 + i % 3 * 0.2, 800 + i, flower=True)
    # Small seat and seed altar sit beyond radius ten, leaving a real destination.
    p.box((55, 8.7, 51), (3.7, 0.38, 1.1), TIMBER)
    for x in (53.7, 56.3):
        p.box((x, 8.3, 51), (0.32, 0.65, 0.75), WOOD)
    p.tube((65, 8, 50), (65, 9.4, 50), 1.0, ROCK_LIGHT, sides=8, end_radius=0.8)
    p.orb((65, 10.15, 50), (0.45, 0.76, 0.45), GOLD, sides=10, rings=5)
    return p


def setup_render(objects):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.resolution_x, scene.render.resolution_y = 1440, 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.24, 0.40, 0.50, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    for name, location, energy, size, color in (
        ("Studio_Key", (-40, 75, 55), 110000, 45, (1.0, 0.78, 0.52)),
        ("Studio_Fill", (45, 25, 25), 46000, 55, (0.55, 0.78, 1.0)),
        ("Studio_Rim", (-10, 55, -55), 80000, 35, (1.0, 0.85, 0.59)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = xyz(location)
        obj.rotation_euler = (Vector(xyz((0, 0, -10))) - obj.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("Studio_Camera")
    camera = bpy.data.objects.new("Studio_Camera", data)
    scene.collection.objects.link(camera)
    data.type, data.lens = "ORTHO", 48
    scene.camera = camera
    for obj in objects:
        if obj.get("runtime_template"):
            obj.hide_render = True
            obj.hide_set(True)
    return camera


def render(camera, name, location, target, scale, garden=True):
    camera.location = xyz(location)
    camera.rotation_euler = (Vector(xyz(target)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale
    bpy.data.objects["SecretPath"].hide_render = not garden
    bpy.context.scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)


def verify_export(data):
    """Inspect exported bytes and imported geometry, never just source intentions."""
    n, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(data[20:20 + n])
    primitives = sum(len(mesh["primitives"]) for mesh in gltf["meshes"])
    tris = sum(gltf["accessors"][p["indices"]]["count"] // 3
               for mesh in gltf["meshes"] for p in mesh["primitives"])
    errors = []
    if tris > 60000:
        errors.append(f"triangle target exceeded: {tris}")
    if primitives > 24:
        errors.append(f"primitive target exceeded: {primitives}")
    expected = {"AdventureRoot": (0, 0, 0), "Keeper": (8, 1.2, -2),
                "WindmillTower": (-19, 0, -12), "WindmillRotor": (-19, 14, -12)}
    origins = {}
    for node in gltf["nodes"]:
        if node.get("name") in expected:
            translation = node.get("translation", [0, 0, 0])
            origins[node["name"]] = translation
            if any(abs(a - b) > 0.001 for a, b in zip(translation, expected[node["name"]])):
                errors.append(f"semantic coordinate mismatch: {node['name']}")
    if set(expected) != set(origins):
        errors.append("missing semantic origins")
    if gltf.get("textures") or gltf.get("images"):
        errors.append("unexpected external texture")
    report = {"source": str(SOURCE), "glb": str(GLB), "triangles": tris,
              "primitives": primitives, "materials": len(gltf.get("materials", [])),
              "bytes": len(data), "gzip9_bytes": len(gzip.compress(data, 9, mtime=0)),
              "semantic_origins_y_up": origins,
              "coordinates": "Three.js Y-up; local home y=0; gallery asset only",
              "secret_garden_local_y_up": [60, 8, 40], "garden_landing_radius": 10,
              "asset_license": "project-authored", "errors": errors}
    return report


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    root = bpy.data.objects.new("AdventureRoot", None)
    bpy.context.scene.collection.objects.link(root)
    for key, value in {
        "asset_license": "project-authored", "asset_version": "art-v2.2",
        "geometry_style": "woven-sanctuary-layered-cliff", "landing_radius": 14.0,
        "world_anchor_y_up": [-82.0, 6.0, 30.0],
        "secret_garden_local_y_up": [60.0, 8.0, 40.0],
        "secret_garden_world_y_up": [-22.0, 14.0, 70.0],
        "secret_garden_landing_radius": 10.0,
        "authoring_source": "tools/blender/build_hub_art_v2.py",
        "runtime_templates": "Bird,BirdPerch,RelayDevice,Relic,Charm",
        "integration_status": "preview-not-production",
    }.items():
        root[key] = value
    materials = (material("M_HubV2_Surface"), material("M_HubV2_Glow", True))
    parts = [terrain(), terraces(), nest(), *windmill(), greenery(), keeper(),
             *decorations(), secret_path(), *templates()]
    objects = [part.finish(root, materials) for part in parts]
    # Fabric is intentionally open geometry, visible from both its sides.
    materials[0].use_backface_culling = False
    for obj in objects:
        obj["geometry_style"] = "woven-sanctuary-layered-cliff"
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True,
                              export_yup=True, export_extras=True, export_animations=False,
                              export_cameras=False, export_lights=False, export_apply=True,
                              export_materials="EXPORT", export_normals=True,
                              export_texcoords=False, export_tangents=False)
    report = verify_export(GLB.read_bytes())
    camera = setup_render(objects)
    render(camera, "hub-overview.png", (94, 63, 118), (10, -4, -4), 125)
    render(camera, "hub-detail.png", (52, 36, 63), (-3, 8, -13), 70, garden=False)
    bpy.data.objects["SecretPath"].hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    # Fresh GLB reimport proves normals and landing planes after export.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    bpy.context.view_layer.update()
    invalid, degenerates = [], 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        degenerates += sum(t.area < 1e-9 for t in obj.data.loop_triangles)
        if any(not all(math.isfinite(x) for x in (*v.co, *v.normal)) or v.normal.length_squared < 0.5
               for v in obj.data.vertices):
            invalid.append(obj.name)
    report["invalid_geometry_meshes"] = invalid
    report["degenerate_triangles"] = degenerates
    for name, center, radii in (("Terrain", (0, 0, 0), (0, 7, 14)),
                               ("SecretPath", (60, 8, 40), (0, 5, 10))):
        obj = bpy.data.objects[name]
        tree = BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
                                   [tuple(p.vertices) for p in obj.data.polygons])
        valid = 0
        for radius in radii:
            for i in range(16):
                a = TAU * i / 16
                point = (center[0] + radius * math.cos(a), center[1] + 2,
                         center[2] + radius * math.sin(a))
                hit, normal, _, distance = tree.ray_cast(Vector(xyz(point)), Vector(xyz((0, -1, 0))), 2.05)
                valid += bool(hit is not None and 1.985 <= distance <= 2.015
                              and normal.dot(Vector(xyz((0, 1, 0)))) > 0.99)
        report[name + "_floor_samples"] = {"supported": valid, "total": 48}
        if valid != 48:
            report["errors"].append(f"{name} floor ray samples {valid}/48")
    if invalid or degenerates:
        report["errors"].append("invalid normals or degenerate triangles")
    (OUT / "hub-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("HUB_ART_V2_REPORT=" + json.dumps(report))
    if report["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
