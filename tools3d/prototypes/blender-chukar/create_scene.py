"""PROTOTYPE — authored Blender Chukar terrain vertical slice.

Question: can an authored low-poly Blender asset materially outperform the
runtime-generated terrain while remaining compact enough for Three.js?
"""

from __future__ import annotations

import math
import os
import random

import bpy
from mathutils import Vector


ROOT = "/Users/bradya/Documents/code/uplandin"
OUT_DIR = os.path.join(ROOT, "public", "prototypes", "blender-chukar")
BLEND_PATH = os.path.join(OUT_DIR, "chukar-vertical-slice.blend")
GLB_PATH = os.path.join(OUT_DIR, "chukar-vertical-slice.glb")
APPROACH_PATH = os.path.join(OUT_DIR, "chukar-approach.png")
OVERVIEW_PATH = os.path.join(OUT_DIR, "chukar-overview.png")

random.seed(6601)
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name: str, color: tuple[float, float, float], roughness: float = 0.92) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    materials: list[bpy.types.Material],
    face_materials: list[int] | None = None,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = False
        if face_materials:
            polygon.material_index = face_materials[index % len(face_materials)]
    return obj


def gaussian(value: float, center: float, width: float) -> float:
    return math.exp(-((value - center) / width) ** 2)


def ground_height(x: float, y: float) -> float:
    """Art-directed macro composition; noise only breaks perfectly clean planes."""
    approach_grade = (y + 100.0) * 0.035
    right_fold = 18.0 * gaussian(x, 69.0 + math.sin(y * 0.018) * 12.0, 53.0)
    left_fold = 10.0 * gaussian(x, -92.0 + math.sin(y * 0.026) * 9.0, 46.0)
    drainage_center = -13.0 + math.sin((y + 20.0) * 0.031) * 15.0
    drainage = -10.5 * gaussian(x, drainage_center, 25.0) * gaussian(y, 28.0, 125.0)
    shoulder = 7.0 * gaussian(x, 22.0, 58.0) * gaussian(y, 73.0, 72.0)
    bench = -2.0 * gaussian(y, -4.0, 23.0) * gaussian(x, 34.0, 75.0)
    authored_facet = (
        math.sin(x * 0.067 + y * 0.021) * 0.62
        + math.sin(x * 0.024 - y * 0.049 + 1.7) * 0.48
        + math.sin((x + y) * 0.115) * 0.18
    )
    return approach_grade + right_fold + left_fold + drainage + shoulder + bench + authored_facet


def create_terrain(materials: list[bpy.types.Material]) -> bpy.types.Object:
    size_x, size_y = 250.0, 230.0
    cols, rows = 74, 68
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    for row in range(rows + 1):
        y = -105.0 + size_y * row / rows
        for col in range(cols + 1):
            x = -size_x * 0.5 + size_x * col / cols
            vertices.append((x, y, ground_height(x, y)))

    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            b = a + 1
            d = (row + 1) * (cols + 1) + col
            c = d + 1
            triangles = ((a, b, c), (a, c, d)) if (row + col) % 2 else ((a, b, d), (b, c, d))
            for tri in triangles:
                faces.append(tri)
                cx = sum(vertices[i][0] for i in tri) / 3.0
                cy = sum(vertices[i][1] for i in tri) / 3.0
                p0, p1, p2 = (Vector(vertices[i]) for i in tri)
                normal = (p1 - p0).cross(p2 - p0).normalized()
                slope = 1.0 - max(0.0, normal.z)
                drainage_center = -13.0 + math.sin((cy + 20.0) * 0.031) * 15.0
                in_drainage = gaussian(cx, drainage_center, 21.0)
                rock_band = gaussian(cx, 66.0, 47.0) * gaussian(cy, 57.0, 80.0)
                selector = math.sin(cx * 0.19 + cy * 0.11) + math.sin(cy * 0.31) * 0.35
                if slope > 0.21 or (rock_band > 0.58 and selector > 0.42):
                    face_materials.append(3 if selector > 0.25 else 4)
                elif in_drainage > 0.72:
                    face_materials.append(2)
                elif selector > 0.72:
                    face_materials.append(1)
                else:
                    face_materials.append(0)

    terrain = mesh_object("PROTO_Terrain", vertices, faces, materials, face_materials)
    terrain["prototype_role"] = "authored_heightfield"
    return terrain


def create_cliff(
    name: str,
    x0: float,
    x1: float,
    y_base: float,
    height: float,
    depth: float,
    columns: int,
    rows: int,
    materials: list[bpy.types.Material],
    seed: int,
) -> bpy.types.Object:
    rng = random.Random(seed)
    front: list[list[int]] = []
    back: list[list[int]] = []
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []

    ridge_profile = [rng.uniform(-1.8, 2.1) for _ in range(columns + 1)]
    for side, target in ((0, front), (1, back)):
        for row in range(rows + 1):
            row_indices: list[int] = []
            v = row / rows
            for col in range(columns + 1):
                u = col / columns
                x = x0 + (x1 - x0) * u
                curve = math.sin(u * math.pi * 1.25) * 7.0 + math.sin(u * math.pi * 4.0) * 1.7
                y = y_base + curve + side * depth
                ground = ground_height(x, y_base + curve)
                cap = height * (0.78 + 0.18 * math.sin(u * math.pi) + ridge_profile[col] * 0.025)
                z = ground + cap * v
                if 0 < row < rows:
                    y += math.sin(col * 2.17 + row * 1.31) * (1.45 if side == 0 else 0.55)
                    z += math.sin(col * 1.71 - row * 2.03) * 0.72
                if side == 1:
                    z -= 0.8 + math.sin(col) * 0.25
                row_indices.append(len(vertices))
                vertices.append((x, y, z))
            target.append(row_indices)

    def add_quad(a: int, b: int, c: int, d: int, mat: int, flip: bool = False) -> None:
        if flip:
            faces.extend(((a, b, d), (b, c, d)))
        else:
            faces.extend(((a, b, c), (a, c, d)))
        face_materials.extend((mat, min(len(materials) - 1, mat + (1 if rng.random() < 0.18 else 0))))

    for row in range(rows):
        for col in range(columns):
            geology = 1 if row in (1, 3) else 0
            if rng.random() < 0.13 and 1 < row < rows:
                geology = 3
            add_quad(front[row][col], front[row][col + 1], front[row + 1][col + 1], front[row + 1][col], geology, (row + col) % 2 == 0)
            add_quad(back[row][col + 1], back[row][col], back[row + 1][col], back[row + 1][col + 1], 2)

    for col in range(columns):
        add_quad(front[rows][col], front[rows][col + 1], back[rows][col + 1], back[rows][col], 1)
        add_quad(back[0][col], back[0][col + 1], front[0][col + 1], front[0][col], 2)
    for row in range(rows):
        add_quad(front[row][0], front[row + 1][0], back[row + 1][0], back[row][0], 2)
        add_quad(back[row][-1], back[row + 1][-1], front[row + 1][-1], front[row][-1], 2)

    obj = mesh_object(name, vertices, faces, materials, face_materials)
    obj["prototype_role"] = "hero_rimrock"
    return obj


def create_strata_cliff(
    name: str,
    x0: float,
    x1: float,
    y_base: float,
    max_height: float,
    columns: int,
    materials: list[bpy.types.Material],
    seed: int,
) -> bpy.types.Object:
    """Build a wall from authored strata blocks with real fracture gaps."""
    rng = random.Random(seed)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    span = (x1 - x0) / columns

    def add_face(indices: tuple[int, ...], mat_index: int) -> None:
        if len(indices) == 4:
            faces.extend(((indices[0], indices[1], indices[2]), (indices[0], indices[2], indices[3])))
            face_materials.extend((mat_index, mat_index))
        else:
            faces.append(indices)
            face_materials.append(mat_index)

    crown = [
        0.72 + 0.2 * math.sin((col / max(1, columns - 1)) * math.pi)
        + rng.uniform(-0.07, 0.08)
        for col in range(columns)
    ]
    for col in range(columns):
        gap = rng.uniform(0.16, 0.62)
        bx0 = x0 + col * span + gap * 0.5
        bx1 = x0 + (col + 1) * span - gap * 0.5
        center_x = (bx0 + bx1) * 0.5
        curve = math.sin((center_x - x0) / (x1 - x0) * math.pi * 1.22) * 6.0
        front_y = y_base + curve + rng.uniform(-0.75, 0.75)
        rock_depth = rng.uniform(7.0, 12.5)
        base_z = ground_height(center_x, front_y) - 0.5
        column_height = max_height * crown[col]
        layers = max(4, round(column_height / 3.3))
        layer_height = column_height / layers
        for layer in range(layers):
            lower = base_z + layer * layer_height + (0.09 if layer else 0)
            upper = base_z + (layer + 1) * layer_height - 0.08
            inset = (layer // 2) * rng.uniform(0.12, 0.35)
            left = bx0 + inset + rng.uniform(-0.18, 0.18)
            right = bx1 - inset + rng.uniform(-0.18, 0.18)
            front = front_y + (layer // 2) * rng.uniform(0.12, 0.38) + rng.uniform(-0.18, 0.18)
            back = front + rock_depth - layer * 0.08
            slant = rng.uniform(-0.3, 0.3)
            start = len(vertices)
            vertices.extend((
                (left, front, lower),
                (right, front + slant, lower + rng.uniform(-0.12, 0.12)),
                (right - rng.uniform(-0.15, 0.28), front + slant, upper + rng.uniform(-0.16, 0.2)),
                (left + rng.uniform(-0.15, 0.28), front, upper + rng.uniform(-0.16, 0.2)),
                (left + 0.18, back, lower + 0.12),
                (right - 0.18, back + slant, lower + 0.12),
                (right - 0.3, back + slant, upper - 0.16),
                (left + 0.3, back, upper - 0.16),
            ))
            front_mat = 0 if layer % 3 else 1
            if rng.random() < 0.075 and 1 <= layer < layers - 1:
                front_mat = 3
            add_face((start, start + 1, start + 2, start + 3), front_mat)
            add_face((start + 5, start + 4, start + 7, start + 6), 2)
            add_face((start + 4, start, start + 3, start + 7), 2)
            add_face((start + 1, start + 5, start + 6, start + 2), 0)
            add_face((start + 3, start + 2, start + 6, start + 7), 1)
            add_face((start + 4, start + 5, start + 1, start), 2)

    obj = mesh_object(name, vertices, faces, materials, face_materials)
    obj["prototype_role"] = "authored_strata_rimrock"
    return obj


def ico_template() -> tuple[list[Vector], list[tuple[int, int, int]]]:
    phi = (1 + math.sqrt(5)) / 2
    verts = [
        Vector((-1, phi, 0)), Vector((1, phi, 0)), Vector((-1, -phi, 0)), Vector((1, -phi, 0)),
        Vector((0, -1, phi)), Vector((0, 1, phi)), Vector((0, -1, -phi)), Vector((0, 1, -phi)),
        Vector((phi, 0, -1)), Vector((phi, 0, 1)), Vector((-phi, 0, -1)), Vector((-phi, 0, 1)),
    ]
    verts = [v.normalized() for v in verts]
    faces = [
        (0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),(10,7,6),(7,1,8),
        (3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),(2,4,11),(6,2,10),(8,6,7),(9,8,1),
    ]
    return verts, faces


def create_talus(materials: list[bpy.types.Material]) -> bpy.types.Object:
    base_vertices, base_faces = ico_template()
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    face_materials: list[int] = []
    rng = random.Random(8183)
    clusters = [(48, 38, 24, 3.3), (76, 52, 18, 2.7), (22, 31, 20, 2.1), (85, 18, 14, 1.8)]
    for cx, cy, count, max_size in clusters:
        for _ in range(count):
            angle = rng.random() * math.tau
            radius = rng.random() ** 0.65 * 25.0
            x = cx + math.cos(angle) * radius
            y = cy + math.sin(angle) * radius * 0.58
            size = 0.5 + rng.random() ** 2 * max_size
            sx, sy, sz = size * rng.uniform(0.75, 1.35), size * rng.uniform(0.65, 1.4), size * rng.uniform(0.45, 0.95)
            yaw = rng.random() * math.tau
            cos_yaw, sin_yaw = math.cos(yaw), math.sin(yaw)
            start = len(vertices)
            for vertex in base_vertices:
                vx, vy, vz = vertex.x * sx, vertex.y * sy, vertex.z * sz
                rx = vx * cos_yaw - vy * sin_yaw
                ry = vx * sin_yaw + vy * cos_yaw
                vertices.append((x + rx, y + ry, ground_height(x, y) + vz + sz * 0.7))
            rock_mat = rng.choice((0, 0, 0, 1, 2))
            for face_index, face in enumerate(base_faces):
                faces.append(tuple(start + index for index in face))
                face_materials.append(1 if face_index % 7 == 0 and rock_mat == 0 else rock_mat)
    return mesh_object("PROTO_Talus", vertices, faces, materials, face_materials)


def create_sage_and_grass(sage_materials: list[bpy.types.Material], grass_materials: list[bpy.types.Material]) -> tuple[bpy.types.Object, bpy.types.Object]:
    rng = random.Random(3119)
    ico_vertices, ico_faces = ico_template()
    sage_vertices: list[tuple[float, float, float]] = []
    sage_faces: list[tuple[int, ...]] = []
    sage_face_materials: list[int] = []
    grass_vertices: list[tuple[float, float, float]] = []
    grass_faces: list[tuple[int, ...]] = []
    grass_face_materials: list[int] = []

    def excluded(x: float, y: float) -> bool:
        drainage_center = -13.0 + math.sin((y + 20.0) * 0.031) * 15.0
        return abs(x - drainage_center) < 12.0 or (18 < x < 108 and 23 < y < 78)

    for _ in range(132):
        x, y = rng.uniform(-116, 116), rng.uniform(-98, 118)
        if excluded(x, y) or rng.random() < gaussian(x, 70, 50) * 0.36:
            continue
        z = ground_height(x, y)
        lobes = 4 + (1 if rng.random() < 0.55 else 0)
        for lobe in range(lobes):
            start = len(sage_vertices)
            scale = rng.uniform(0.4, 0.78)
            angle = lobe / lobes * math.tau + rng.uniform(-0.35, 0.35)
            ox, oy = math.cos(angle) * scale * 0.62, math.sin(angle) * scale * 0.62
            for vertex in ico_vertices:
                sage_vertices.append((
                    x + ox + vertex.x * scale * rng.uniform(0.82, 1.06),
                    y + oy + vertex.y * scale * rng.uniform(0.82, 1.06),
                    z + 0.48 * scale + vertex.z * scale * 0.46,
                ))
            for face in ico_faces:
                sage_faces.append(tuple(start + index for index in face))
                sage_face_materials.append((lobe + int(x + y)) % len(sage_materials))

    for _ in range(3400):
        x, y = rng.uniform(-120, 120), rng.uniform(-102, 122)
        if excluded(x, y) and rng.random() < 0.8:
            continue
        z = ground_height(x, y)
        height = rng.uniform(0.48, 1.18)
        radius = rng.uniform(0.14, 0.31)
        yaw = rng.random() * math.tau
        start = len(grass_vertices)
        for blade in range(4):
            angle = yaw + blade * math.pi / 4
            dx, dy = math.cos(angle) * radius, math.sin(angle) * radius
            lean_x, lean_y = math.cos(yaw) * height * 0.18, math.sin(yaw) * height * 0.18
            grass_vertices.extend(((x - dx, y - dy, z), (x + dx, y + dy, z), (x + lean_x, y + lean_y, z + height)))
            grass_faces.append((start + blade * 3, start + blade * 3 + 1, start + blade * 3 + 2))
            grass_face_materials.append(rng.randrange(len(grass_materials)))

    sage = mesh_object("PROTO_Sage", sage_vertices, sage_faces, sage_materials, sage_face_materials)
    grass = mesh_object("PROTO_Bunchgrass", grass_vertices, grass_faces, grass_materials, grass_face_materials)
    return sage, grass


def create_distant_ranges(materials: list[bpy.types.Material]) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    specs = [
        (165.0, 340.0, 18.0, 34.0, -24.0, 0),
        (245.0, 430.0, 28.0, 48.0, 16.0, 1),
        (345.0, 560.0, 42.0, 66.0, -12.0, 2),
    ]
    for layer, (y, width, low, high, x_shift, mat_index) in enumerate(specs):
        points = 24
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        for i in range(points):
            t = i / (points - 1)
            x = x_shift - width / 2 + width * t
            peak = low + (math.sin(t * math.pi) ** 0.75) * (high - low)
            peak += math.sin(t * math.pi * (4.0 + layer)) * (3.5 + layer)
            vertices.extend(((x, y + layer * 36, -12.0), (x, y + layer * 36, peak)))
        for i in range(points - 1):
            a = i * 2
            faces.extend(((a, a + 1, a + 3), (a, a + 3, a + 2)))
        objects.append(mesh_object(f"PROTO_DistantRange_{layer + 1}", vertices, faces, [materials[mat_index]]))
    return objects


def point_camera(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_camera_and_lighting() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    world = bpy.data.worlds.new("PROTO_GreatBasinWorld") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.29, 0.42, 0.56, 1.0)
    background.inputs["Strength"].default_value = 0.42

    sun_data = bpy.data.lights.new("PROTO_LowSun", type="SUN")
    sun_data.energy = 2.6
    sun_data.angle = math.radians(9.0)
    sun = bpy.data.objects.new("PROTO_LowSun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(42), math.radians(-18), math.radians(-28))

    area_data = bpy.data.lights.new("PROTO_SkyFill", type="AREA")
    area_data.energy = 520.0
    area_data.shape = "DISK"
    area_data.size = 80.0
    area_data.color = (0.43, 0.55, 0.72)
    area = bpy.data.objects.new("PROTO_SkyFill", area_data)
    bpy.context.collection.objects.link(area)
    area.location = (-75, -28, 105)
    point_camera(area, (20, 35, 10))

    camera_data = bpy.data.cameras.new("PROTO_Camera")
    camera_data.lens = 42
    camera_data.sensor_width = 36
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new("PROTO_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render_view(camera: bpy.types.Object, location: tuple[float, float, float], target: tuple[float, float, float], path: str, lens: float) -> None:
    camera.location = location
    camera.data.lens = lens
    point_camera(camera, target)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


clear_scene()

terrain_materials = [
    material("Terrain_Ochre", (0.43, 0.31, 0.18)),
    material("Terrain_SunGrass", (0.62, 0.48, 0.25)),
    material("Terrain_Drainage", (0.25, 0.27, 0.19)),
    material("Terrain_Stone", (0.36, 0.31, 0.27)),
    material("Terrain_Scree", (0.29, 0.25, 0.22)),
]
rock_materials = [
    material("Rimrock_Warm", (0.34, 0.25, 0.20)),
    material("Rimrock_Sun", (0.45, 0.33, 0.24)),
    material("Rimrock_Shade", (0.20, 0.19, 0.18)),
    material("Rimrock_Lichen", (0.45, 0.41, 0.16)),
]
sage_materials = [
    material("Sage_Silver", (0.31, 0.36, 0.29)),
    material("Sage_Olive", (0.25, 0.30, 0.20)),
    material("Sage_Dry", (0.38, 0.37, 0.26)),
]
grass_materials = [
    material("Grass_Straw", (0.67, 0.51, 0.26)),
    material("Grass_Pale", (0.78, 0.64, 0.36)),
    material("Grass_Olive", (0.42, 0.39, 0.22)),
]
range_materials = [
    material("Range_Near", (0.26, 0.29, 0.31)),
    material("Range_Mid", (0.29, 0.34, 0.39)),
    material("Range_Far", (0.36, 0.43, 0.49)),
]

terrain = create_terrain(terrain_materials)
hero_cliff = create_strata_cliff("PROTO_HeroCliff", 15, 108, 41, 23, 9, rock_materials, 7127)
secondary_cliff = create_strata_cliff("PROTO_SecondaryCliff", -112, -48, 85, 14, 7, rock_materials, 9121)
talus = create_talus(rock_materials)
sage, grass = create_sage_and_grass(sage_materials, grass_materials)
ranges = create_distant_ranges(range_materials)

for obj in (terrain, hero_cliff, secondary_cliff, talus, sage, grass, *ranges):
    obj["prototype"] = True

camera = setup_camera_and_lighting()
approach_ground = ground_height(-23, -88)
render_view(camera, (-23, -88, approach_ground + 2.25), (29, 49, 12.5), APPROACH_PATH, 45)
render_view(camera, (-93, -73, 22), (23, 48, 10), OVERVIEW_PATH, 52)

bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

bpy.ops.object.select_all(action="DESELECT")
for obj in (terrain, hero_cliff, secondary_cliff, talus, sage, grass, *ranges):
    obj.select_set(True)
bpy.context.view_layer.objects.active = terrain
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
)

print({
    "blend": BLEND_PATH,
    "glb": GLB_PATH,
    "approach": APPROACH_PATH,
    "overview": OVERVIEW_PATH,
    "objects": len(bpy.context.scene.objects),
    "triangles": sum(len(obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == "MESH"),
})
