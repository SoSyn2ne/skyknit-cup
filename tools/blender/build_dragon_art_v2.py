"""Author the independent Art V2 dragon; never overwrite shipped assets.

Blender uses +Y forward / +Z up. The GLB export converts to -Z forward / +Y up.
All visible geometry and colors are project-authored, without external textures.
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import random
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dragon_blockout import clear_file, look_at, make_collection

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/art-v2"
BLEND = ROOT / "assets/source/art-v2/dragon-v2.blend"
SCARLET = (0.40, 0.026, 0.025, 1.0)
SCALE = (0.48, 0.039, 0.025, 1.0)
GOLD = (0.82, 0.45, 0.105, 1.0)
CREAM = (0.86, 0.72, 0.44, 1.0)
DARK = (0.034, 0.012, 0.016, 1.0)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def catmull(values, t):
    f = max(0.0, min(0.999999, t)) * (len(values) - 1)
    i, u = int(f), f - int(f)
    a, b, c, d = [Vector(values[max(0, min(len(values) - 1, j))]) for j in (i - 1, i, i + 1, i + 2)]
    return (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3) * 0.5


def frame(points, t):
    center = catmull(points, t)
    tangent = (catmull(points, min(1, t + 0.001)) - catmull(points, max(0, t - 0.001))).normalized()
    if tangent.length < 0.5:
        tangent = Vector((0, 1, 0))
    side = tangent.cross(Vector((0, 0, 1))).normalized()
    if side.length < 0.5:
        side = Vector((1, 0, 0))
    up = side.cross(tangent).normalized()
    return center, tangent, side, up


class Mesh:
    """One compact runtime draw primitive per rigid articulation."""
    def __init__(self, name, pivot, collection, material):
        self.name, self.pivot, self.collection, self.material = name, pivot, collection, material
        self.vertices, self.faces, self.colors = [], [], []
        self.scale_count = 0

    def append(self, vertices, faces, color):
        offset = len(self.vertices)
        self.vertices.extend(tuple(v) for v in vertices)
        self.faces.extend(tuple(offset + j for j in face) for face in faces)
        self.colors.extend(color if isinstance(color[0], (float, int)) else color[i] for i in range(len(vertices)))

    def tube(self, points, radii, color, rings=24, sides=12, flatten=1.0, ventral=None):
        vertices, colors, faces = [], [], []
        for i in range(rings + 1):
            t = i / rings
            c, tangent, side, up = frame(points, t)
            radius = catmull([(r[0], r[1], 0) if isinstance(r, tuple) else (r, r * flatten, 0) for r in radii], t)
            for j in range(sides):
                theta = math.tau * j / sides
                vertices.append(c + side * math.cos(theta) * max(0.001, radius.x) + up * math.sin(theta) * max(0.001, radius.y))
                shade = 0.92 + 0.08 * math.sin(theta)
                surface_color = mix(color, ventral, min(1, max(0, (-math.sin(theta) - .32) / .14))) if ventral else color
                colors.append(tuple(v * shade for v in surface_color[:3]) + (1.0,))
                if i < rings:
                    a = i * sides + j
                    b = i * sides + (j + 1) % sides
                    faces.append((a, a + sides, b + sides, b))
        faces.extend([tuple(reversed(range(sides))), tuple(rings * sides + j for j in range(sides))])
        self.append(vertices, faces, colors)

    def ellipsoid(self, center, radius, color, segments=16, rings=10):
        points, faces = [], []
        for i in range(rings + 1):
            phi = math.pi * i / rings
            for j in range(segments):
                theta = math.tau * j / segments
                points.append(Vector(center) + Vector((radius[0] * math.sin(phi) * math.cos(theta), radius[1] * math.sin(phi) * math.sin(theta), radius[2] * math.cos(phi))))
                if i < rings:
                    a, b = i * segments + j, i * segments + (j + 1) % segments
                    faces.append((a, b, b + segments, a + segments))
        self.append(points, faces, color)

    def plate(self, center, across, along, normal, width, length, color, height=0.045, curvature=None):
        c, u, v, n = map(Vector, (center, across, along, normal))
        outline = [(0, .53), (-.46, .34), (-.51, -.08), (-.30, -.40), (0, -.65), (.30, -.40), (.51, -.08), (.46, .34)]
        verts = [c + u * x * width + v * y * length + n * (height * .10 - ((x * width) ** 2 / (2 * curvature) if curvature else 0)) for x, y in outline]
        verts.append(c + n * height + v * length * .03)
        faces = [(i, (i + 1) % 8, 8) for i in range(8)]
        self.append(verts, faces, [mix(color, DARK, .14)] * 8 + [color])
        self.scale_count += 1

    def scutes(self, points, radii, rows, around, width, length, lower=-0.25, seed=1):
        rng = random.Random(seed)
        for i in range(rows):
            t = (i + .5) / rows
            c, tangent, side, up = frame(points, t)
            radius = catmull([(r[0], r[1], 0) if isinstance(r, tuple) else (r, r, 0) for r in radii], t)
            for j in range(around):
                angle = (j + (i % 2) * .5) * math.tau / around
                if math.sin(angle) < lower:
                    continue
                normal = (side * math.cos(angle) + up * math.sin(angle)).normalized()
                across = tangent.cross(normal).normalized()
                pos = c + side * math.cos(angle) * radius.x + up * math.sin(angle) * radius.y + normal * .004
                color = mix(SCALE, SCARLET, rng.uniform(.0, .45))
                fitted_width = max(width * .65, math.tau * max(radius.x, radius.y) / around * 1.10)
                self.plate(pos, across, tangent, normal, fitted_width, length, color, height=.018 + width * .06, curvature=max(.08,min(radius.x,radius.y)))

    def finish(self):
        data = bpy.data.meshes.new(self.name + "Geometry")
        inverse = self.pivot.matrix_world.inverted()
        data.from_pydata([inverse @ Vector(v) for v in self.vertices], [], self.faces)
        data.update()
        attr = data.color_attributes.new(name="DragonColor", type="FLOAT_COLOR", domain="POINT")
        for item, color in zip(attr.data, self.colors):
            item.color = color
        data.color_attributes.active_color = attr
        # Recalculate coherent shell normals while retaining open sculpted plates.
        bm = bmesh.new()
        bm.from_mesh(data)
        # Tube tips, eye poles and the wing fan converge at shared points.
        # Weld these coincident vertices so exported triangles never collapse.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        collapsed = [face for face in bm.faces if face.calc_area() <= 1e-10]
        if collapsed:
            bmesh.ops.delete(bm, geom=collapsed, context="FACES_ONLY")
        unused = [vertex for vertex in bm.verts if not vertex.link_faces]
        if unused:
            bmesh.ops.delete(bm, geom=unused, context="VERTS")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        for face in data.polygons:
            face.use_smooth = True
        obj = bpy.data.objects.new(self.name, data)
        self.collection.objects.link(obj)
        obj.parent = self.pivot
        data.materials.append(self.material)
        obj["authored_scale_plates"] = self.scale_count
        return obj


def pivot(name, position, parent, collection):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .2
    obj.parent = parent
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Translation(Vector(position))
    bpy.context.view_layer.update()
    return obj


def material(name, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (1, 1, 1, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "DragonColor"
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    mat.use_backface_culling = False
    return mat


def body(mesh):
    points = [(0,-2.4,2.35), (0,-1.8,2.42), (0,-.65,2.55), (0,.45,2.85), (0,1.18,3.28), (0,1.7,3.98), (0,2.2,4.5), (0,2.7,4.58)]
    radii = [(.39,.38),(.77,.65),(.94,.87),(.85,.87),(.61,.74),(.42,.56),(.37,.43),(.34,.35)]
    mesh.tube(points, radii, SCARLET, rings=64, sides=28, ventral=mix(CREAM, GOLD, .26))
    mesh.scutes(points, radii, 50, 18, .26, .25, seed=41)
    # Broad curved belly shields follow the entire underside, not flat boxes.
    for row in range(23):
        t = .09 + row * .038
        c, tangent, side, up = frame(points, t)
        r = catmull([(x,y,0) for x,y in radii], t)
        for strip in range(7):
            a = math.pi * (1.25 + strip / 6 * .5)
            n = side * math.cos(a) + up * math.sin(a)
            p = c + side * math.cos(a) * r.x + up * math.sin(a) * r.y
            mesh.plate(p, tangent.cross(n), tangent, n, max(.1,r.x*.43), .28, mix(CREAM,GOLD,.18 + row*.007), .022)
    for i in range(13):
        t = .07 + i * .069
        c, tangent, side, up = frame(points, t)
        r = catmull([(x,y,0) for x,y in radii], t)
        p = c + up * r.y
        mesh.tube([p, p + up * .25 - tangent*.08, p + up * (.52 if i<8 else .36)-tangent*.26], [.15,.13,.004], mix(GOLD,SCARLET,.25), rings=7, sides=7)
    return points, radii


def make_head(mesh, jaw, eyes):
    # Close the muzzle as part of the same loft, avoiding a visible flat end cap.
    points = [(0,2.32,4.58), (0,2.72,4.72), (0,3.08,4.69), (0,3.40,4.52), (0,3.78,4.45), (0,4.10,4.47), (0,4.20,4.455), (0,4.31,4.44), (0,4.33,4.44)]
    radii = [(.33,.33),(.53,.44),(.56,.38),(.41,.23),(.31,.18),(.27,.18),(.20,.15),(.085,.065),(.003,.003)]
    mesh.tube(points, radii, SCARLET, rings=48, sides=28)
    mesh.scutes(points[:4], radii[:4], 17, 15, .18, .19, seed=26)
    jaw.tube([(0,2.77,4.30),(0,3.25,4.18),(0,3.72,4.21),(0,4.11,4.25)],[(.39,.13),(.39,.15),(.28,.11),(.19,.07)],mix(CREAM,GOLD,.10),rings=24,sides=16)
    for side, eye in zip((-1,1),eyes):
        s=float(side)
        # Almond sockets, spherical irises and vertical pupil slits face laterally-forward.
        mesh.ellipsoid((s*.51,3.00,4.81),(.075,.255,.175),DARK)
        eye.ellipsoid((s*.565,3.05,4.82),(.07,.18,.14),(0.95,.53,.065,1),segments=20,rings=12)
        eye.ellipsoid((s*.622,3.075,4.82),(.013,.035,.12),DARK,segments=12,rings=10)
        eye.ellipsoid((s*.635,3.11,4.875),(.016,.035,.031),(1,.97,.82,1),segments=8,rings=6)
        mesh.tube([(s*.48,2.82,4.91),(s*.60,3.00,4.98),(s*.46,3.25,4.86)],[.085,.095,.04],SCALE,rings=16,sides=8)
        mesh.tube([(s*.38,3.33,4.34),(s*.31,3.76,4.32),(s*.19,4.14,4.33)],[.016,.019,.010],DARK,rings=18,sides=6)
        mesh.ellipsoid((s*.215,4.075,4.585),(.056,.077,.028),DARK,segments=12,rings=8)
        # Back-swept ivory horns have ringed growth, with curved tips instead of cones.
        horns=[(s*.35,2.48,5.0),(s*.55,2.16,5.40),(s*.62,1.84,5.82),(s*.56,1.78,6.13),(s*.48,1.90,6.29)]
        hr=[.20,.16,.10,.047,.002]
        mesh.tube(horns,hr,CREAM,rings=28,sides=12)
        for k in range(7):
            c,tangent,u,v=frame(horns,.10+k*.105)
            r=catmull([(q,q,0) for q in hr],.10+k*.105).x
            ring=[c+(u*math.cos(j*math.tau/16)+v*math.sin(j*math.tau/16))*(r+.004) for j in range(17)]
            mesh.tube(ring,[.008]*17,mix(CREAM,GOLD,.36),rings=16,sides=5)
        for k in range(3):
            base=Vector((s*(.38+k*.055),2.62-k*.20,4.60-k*.04))
            mesh.tube([base,base+Vector((s*.30,-.26,.10)),base+Vector((s*.46,-.60,.21))],[.16,.105,.002],mix(GOLD,SCARLET,.30),rings=12,sides=8,flatten=.38)
        for k in range(3):
            y=3.40+k*.20
            jaw.tube([(s*(.29-k*.025),y,4.29),(s*(.30-k*.025),y+.012,4.40)],[.035,.001],CREAM,rings=4,sides=6)


def wing(mesh, side):
    s=float(side)
    def p(x,y,z): return Vector((s*x,y,z))
    root,elbow,wrist=p(.68,.42,3.12),p(1.85,-.12,3.78),p(3.03,.47,4.95)
    arm=[root,p(1.22,.15,3.44),elbow,p(2.40,.01,4.42),wrist]
    ar=[.37,.30,.24,.19,.17]
    mesh.tube(arm,ar,SCARLET,rings=36,sides=16)
    mesh.scutes(arm,ar,22,11,.15,.22,lower=-.45,seed=9+side)
    tips=[p(6.45,1.53,5.84),p(6.43,-1.60,4.52),p(5.05,-3.12,3.45),p(2.90,-3.36,2.81),p(.77,-1.45,2.80)]
    curves=[]
    for j,tip in enumerate(tips):
        middle=wrist.lerp(tip,.53)+Vector((0,.16,.22))
        path=[wrist,middle,tip]
        curves.append(path)
        mesh.tube(path,[.13 if j==0 else .085,.07,.018],mix(SCARLET,SCALE,.22),rings=22,sides=8)
    # Organic fan panels: concave scallops and inflated camber between fingers.
    for panel in range(4):
        verts,faces,colors=[],[],[]
        resolution=18
        for i in range(resolution+1):
            u=i/resolution
            for j in range(resolution+1):
                v=j/resolution
                edge=1-.16*math.sin(math.pi*v)**.85
                r=u*edge
                a,b=catmull(curves[panel],r),catmull(curves[panel+1],r)
                point=a.lerp(b,v)
                point.z+=.35*math.sin(math.pi*u)*math.sin(math.pi*v)
                verts.append(point)
                light=.16+.40*r+.10*math.sin(math.pi*v)
                colors.append(mix((.51,.135,.032,1),(.95,.62,.18,1),light))
                if i<resolution and j<resolution:
                    k=i*(resolution+1)+j
                    faces.append((k,k+1,k+resolution+2,k+resolution+1))
        mesh.append(verts,faces,colors)
        border=[]
        for j in range(23):
            v=j/22
            edge=1-.16*math.sin(math.pi*v)**.85
            border.append(catmull(curves[panel],edge).lerp(catmull(curves[panel+1],edge),v))
        mesh.tube(border,[.030]*len(border),mix(SCARLET,GOLD,.16),rings=26,sides=6)
        # Sparse raised membrane veins are readable close up without noisy textures.
        for branch in (.34,.64):
            vein=[]
            for j in range(6):
                u=.27+j*.11
                v=branch+.10*math.sin(j*.4)
                r=u*(1-.16*math.sin(math.pi*v)**.85)
                point=catmull(curves[panel],r).lerp(catmull(curves[panel+1],r),v)
                point.z+=.35*math.sin(math.pi*u)*math.sin(math.pi*v)+.008
                vein.append(point)
            mesh.tube(vein,[.014,.012,.011,.009,.007,.001],mix(GOLD,SCARLET,.3),rings=14,sides=5)
    mesh.tube([wrist,wrist+p(.12,.12,.31),wrist+p(.08,.28,.49)],[.10,.06,.001],CREAM,rings=10,sides=8)


def leg(mesh, side, hind):
    s=float(side)
    if hind:
        points=[(s*.67,-1.55,2.46),(s*1.02,-1.67,1.94),(s*.90,-1.18,1.40),(s*.95,-1.60,1.06),(s*.94,-1.98,.91)]
        radii=[(.43,.49),(.48,.50),(.26,.27),(.16,.16),(.20,.14)]
    else:
        points=[(s*.68,.74,2.74),(s*.85,.90,2.19),(s*.90,.64,1.68),(s*.81,1.10,1.33),(s*.85,1.42,1.28)]
        radii=[(.30,.35),(.30,.34),(.21,.22),(.14,.15),(.18,.12)]
    mesh.tube(points,radii,SCARLET,rings=35,sides=16)
    mesh.scutes(points,radii,19,10,.135,.16,lower=-.40,seed=5+side+hind)
    foot=Vector(points[-1])
    for toe in (-1,0,1):
        start=foot+Vector((toe*.125,0,-.015))
        end=start+Vector((toe*.018,.35,-.07))
        mesh.tube([start,start.lerp(end,.6),end],[.085,.082,.05],SCARLET,rings=6,sides=6)
        mesh.tube([end,end+Vector((0,.18,-.018)),end+Vector((0,.24,-.10))],[.061,.038,.001],DARK,rings=6,sides=6)


def tail(meshes):
    points=[(0,-2.28,2.37),(0,-3.34,2.22),(.10,-4.46,2.05),(.25,-5.60,1.96),(.42,-6.72,2.14),(.48,-7.72,2.58)]
    radii=[.44,.32,.24,.175,.11,.035]
    for i,mesh in enumerate(meshes):
        ts=[(i+j/10)/5 for j in range(11)]
        section=[catmull(points,t) for t in ts]
        rs=[catmull([(r,r,0) for r in radii],t).x for t in ts]
        mesh.tube(section,rs,SCARLET,rings=18,sides=14)
        mesh.scutes(section,rs,9,10,max(.08,rs[0]*.52),.17,lower=-.35,seed=64+i)
        for j in range(2):
            k=2+j*5
            base=section[k]+Vector((0,0,rs[k]))
            mesh.tube([base,base+Vector((0,-.15,.24-i*.028)),base+Vector((0,-.32,.28-i*.026))],[.10-i*.014,.07-i*.010,.001],GOLD,rings=7,sides=7)
    # Slim split terminal fins taper with the tail instead of a blunt club.
    end=Vector(points[-1])
    for side in (-1,1):
        base=end+Vector((0,.52,0))
        tip=end+Vector((side*.70,-.42,.26))
        mid=end+Vector((side*.43,.10,.10))
        meshes[-1].append([base,mid,tip,end+Vector((0,-.48,.15)),end+Vector((side*.21,-.1,.17))],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],SCALE)
        meshes[-1].tube([base,mid,tip],[.052,.04,.001],GOLD,rings=12,sides=7)


def studio(collection):
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.device="CPU"
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.threads_mode="FIXED"
    scene.render.threads=2
    scene.render.resolution_x=1500
    scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value=(.18,.25,.29,1)
    background.inputs["Strength"].default_value=.40
    scene.view_settings.look="AgX - Medium High Contrast"
    floor_mat=bpy.data.materials.new("Studio_Backdrop")
    floor_mat.diffuse_color=(.11,.16,.18,1)
    floor_mat.use_nodes=True
    floor_mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(.11,.16,.18,1)
    floor_mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.85
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
    floor=bpy.context.object
    floor.name="StudioFloor"
    floor.data.materials.append(floor_mat)
    for old in list(floor.users_collection): old.objects.unlink(floor)
    collection.objects.link(floor)
    for name,pos,power,color,size in [
        ("Key",(6,8,12),2200,(1,.82,.61),7),
        ("Fill",(-8,3,7),1600,(.54,.76,1),8),
        ("Rim",(2,-9,11),2600,(1,.68,.40),6),
    ]:
        data=bpy.data.lights.new(name,"AREA")
        data.energy=power;data.color=color;data.shape="DISK";data.size=size
        lamp=bpy.data.objects.new(name,data)
        collection.objects.link(lamp);lamp.location=pos
        look_at(lamp,Vector((0,0,2.8)))
    data=bpy.data.cameras.new("ArtV2Camera")
    data.type="ORTHO"
    camera=bpy.data.objects.new("ArtV2Camera",data)
    collection.objects.link(camera)
    scene.camera=camera
    return camera


def inspect_export(glb, expected_rigs):
    """Reload the exported artifact, not just the authoring scene."""
    raw = glb.read_bytes()
    json_size, chunk_type = struct.unpack_from("<II", raw, 12)
    assert chunk_type == 0x4E4F534A, "Missing glTF JSON chunk"
    document = json.loads(raw[20:20 + json_size])
    primitive_count = sum(len(mesh["primitives"]) for mesh in document["meshes"])
    assert primitive_count <= 24, f"Export primitive budget: {primitive_count}"
    source_scene = bpy.context.window.scene
    source_names = {obj: obj.name for obj in source_scene.objects}
    for obj, name in source_names.items():
        obj.name = "Authoring_" + name
    audit_scene = bpy.data.scenes.new("ART_V2_EXPORT_AUDIT")
    bpy.context.window.scene = audit_scene
    meshes_before = set(bpy.data.meshes)
    materials_before = set(bpy.data.materials)
    try:
        bpy.ops.import_scene.gltf(filepath=str(glb))
        bpy.context.view_layer.update()
        objects = list(audit_scene.objects)
        imported_meshes = [obj for obj in objects if obj.type == "MESH"]
        errors, invalid_geometry = [], []
        triangles = degenerate = 0
        for obj in imported_meshes:
            data = obj.data
            data.calc_loop_triangles()
            triangles += len(data.loop_triangles)
            finite_positions = all(math.isfinite(x) for vertex in data.vertices for x in vertex.co)
            finite_normals = all(math.isfinite(x) for vertex in data.vertices for x in vertex.normal)
            usable_normals = all(vertex.normal.length > .5 for vertex in data.vertices)
            collapsed = sum(triangle.area <= 1e-12 for triangle in data.loop_triangles)
            degenerate += collapsed
            if not (finite_positions and finite_normals and usable_normals) or collapsed:
                invalid_geometry.append({"mesh": obj.name, "finite_positions": finite_positions, "finite_normals": finite_normals, "usable_normals": usable_normals, "degenerate_triangles": collapsed})
        if invalid_geometry:
            errors.append("Exported geometry is invalid")
        if not 0 < triangles <= 60000:
            errors.append(f"Export triangle budget: {triangles}")
        semantic_rigs = {}
        for name, expected in expected_rigs.items():
            obj = audit_scene.objects.get(name)
            if obj is None or obj.type != "EMPTY":
                errors.append(f"Missing semantic rig: {name}")
                continue
            position = list(obj.matrix_world.translation)
            parent = obj.parent.name if obj.parent else None
            semantic_rigs[name] = {"position_blender": position, "parent": parent}
            if (Vector(position) - Vector(expected["position"])).length > 1e-4 or parent != expected["parent"]:
                errors.append(f"Semantic transform changed: {name}")
        result = {"method": "Blender glTF export reimport", "triangles": triangles, "mesh_primitives": primitive_count, "mesh_objects": len(imported_meshes), "materials": len(document.get("materials", [])), "degenerate_triangles": degenerate, "invalid_geometry_meshes": invalid_geometry, "semantic_rigs": semantic_rigs, "errors": errors}
        assert not errors, json.dumps(result)
        return result
    finally:
        bpy.context.window.scene = source_scene
        for obj in list(audit_scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for obj, name in source_names.items():
            obj.name = name
        bpy.data.scenes.remove(audit_scene)
        for mesh in set(bpy.data.meshes) - meshes_before:
            bpy.data.meshes.remove(mesh)
        for mat in set(bpy.data.materials) - materials_before:
            bpy.data.materials.remove(mat)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--skip-renders",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    OUT.mkdir(parents=True,exist_ok=True);BLEND.parent.mkdir(parents=True,exist_ok=True)
    clear_file()
    bpy.context.preferences.filepaths.save_version=0
    collection=make_collection("DRAGON_ART_V2")
    environment=make_collection("ART_V2_STUDIO")
    root=pivot("DragonRoot",(0,0,0),None,collection)
    for key,value in {"asset_version":"art-v2.1","asset_license":"project-authored","runtime_rig":"rigid-art-v2-preview","forward_axis":"+Y","up_axis":"+Z","reference":"assets/source/art-v2/reference/skyknit-rebuild-target.png","anatomy":"four-legs-two-wings-continuous-neck-scalloped-membrane","game_compatibility":"preview-only-not-integrated"}.items(): root[key]=value
    skin=material("DragonV2_VertexPBR",.53)
    eye_mat=material("DragonV2_EyeGloss",.22)
    meshes=[]
    def group(name,rig,mat=skin):
        mesh=Mesh(name,rig,collection,mat);meshes.append(mesh);return mesh
    body(group("Dragon_Body",root))
    head_rig=pivot("HeadRig",(0,2.35,4.57),root,collection)
    jaw_rig=pivot("JawRig",(0,2.82,4.30),head_rig,collection)
    eye_rigs=[pivot(f"EyeRig_{label}",(s*.56,3.05,4.82),head_rig,collection) for label,s in (("L",-1),("R",1))]
    make_head(group("Dragon_Head",head_rig),group("Dragon_Jaw",jaw_rig),[group(f"Dragon_Eye_{label}",rig,eye_mat) for label,rig in zip(("L","R"),eye_rigs)])
    for label,s in (("L",-1),("R",1)):
        wing_rig=pivot(f"WingRig_{label}",(s*.68,.42,3.12),root,collection)
        wing(group(f"Dragon_Wing_{label}",wing_rig),s)
        for kind,hind in (("Fore",False),("Hind",True)):
            position=(s*.67,-1.55,2.46) if hind else (s*.68,.74,2.74)
            rig=pivot(f"LegRig_{kind}_{label}",position,root,collection)
            leg(group(f"Dragon_Leg_{kind}_{label}",rig),s,hind)
    parent=root;tail_meshes=[]
    for i,pos in enumerate([(0,-2.28,2.37),(0,-3.34,2.22),(.1,-4.46,2.05),(.25,-5.6,1.96),(.42,-6.72,2.14)],1):
        parent=pivot(f"TailRig_{i}",pos,parent,collection)
        tail_meshes.append(group(f"Dragon_Tail_{i}",parent))
    tail(tail_meshes)
    objects=[mesh.finish() for mesh in meshes]
    bpy.context.view_layer.update()
    triangles=0
    for obj in objects:
        obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
        assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.normal)
    assert triangles<=60000, f"Triangle budget exceeded: {triangles}"
    assert len(objects)<=24
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive: child.select_set(True)
    bpy.context.view_layer.objects.active=root
    glb=OUT/"dragon-v2.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,export_yup=True,export_materials="EXPORT",export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
    expected_rigs = {obj.name: {"position": list(obj.matrix_world.translation), "parent": obj.parent.name if obj.parent else None} for obj in collection.objects if obj.type == "EMPTY"}
    export_audit = inspect_export(glb, expected_rigs)
    camera=studio(environment)
    views=[
        ("dragon-full",(16,9,12),(0,-1.55,3.0),16.9),
        ("dragon-face",(10,15,8),(0,2.1,4.4),5.6),
        ("dragon-wing",(11,-12,14),(1.5,-.5,3.7),13.5),
    ]
    for name,pos,target,scale in views:
        camera.location=pos;camera.data.ortho_scale=scale;look_at(camera,Vector(target))
        bpy.context.scene.render.filepath=str(OUT/(name+".png"))
        if not args.skip_renders: bpy.ops.render.render(write_still=True)
    name,pos,target,scale=views[0]
    camera.location=pos;camera.data.ortho_scale=scale;look_at(camera,Vector(target))
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),check_existing=False)
    bounds=[obj.matrix_world@Vector(corner) for obj in objects for corner in obj.bound_box]
    report={"asset":"dragon-art-v2","blender":bpy.app.version_string,"license":"project-authored","triangles":triangles,"mesh_primitives":len(objects),"materials":2,"authored_scale_plates":sum(mesh.scale_count for mesh in meshes),"bytes":glb.stat().st_size,"gzip_bytes":len(gzip.compress(glb.read_bytes())),"bounds_blender":{"min":[min(p[i] for p in bounds) for i in range(3)],"max":[max(p[i] for p in bounds) for i in range(3)]},"rigs":[obj.name for obj in collection.objects if obj.type=="EMPTY"],"renders":[] if args.skip_renders else [name+".png" for name,*_ in views],"production_integrated":False}
    report["export_audit"] = export_audit
    (OUT/"dragon-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print("DRAGON_ART_V2_REPORT="+json.dumps(report))


if __name__=="__main__":
    main()
