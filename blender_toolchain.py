"""
MVP3: Unrestricted Scene-Specific Headless Blender 4.1 (bpy) Execution Engine.
NO predefined living-room or scene-specific templates.

Executes arbitrary scene-specific Blender Python (`bpy`) scripts authored by Gemini 4 Argon
in a resource-constrained environment, binds Nano Banana seamless PBR textures with automatic
UV cube-projection, computes 3D geometric telemetry (vertex/triangle counts, object bounding boxes,
ground-plane contact elevation deltas, pairwise bounding-box intersections), and exports glTF 2.0 (.glb).

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender_toolchain.py -- <spec.json> <out.glb> <out_script.py> <out_telemetry.json>
"""

import json
import math
import os
import sys
import traceback
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler


MAX_VERTICES_LIMIT = 250000


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def three_to_blender(x: float, y: float, z: float):
    """
    Convert metric Three.js camera space (X right, Y up, -Z forward)
    to Blender world space (X right, Y forward, Z up) so glTF export (export_yup=True)
    maps back 1:1 to Three.js (x, y, z).
    """
    return (float(x), float(-z), float(y))


def blender_to_three(bx: float, by: float, bz: float):
    """
    Convert Blender world space (bx, by, bz) back to Three.js camera space (x, y, z).
    """
    return (float(bx), float(bz), float(-by))


def hex_to_rgba(hex_str: str, alpha: float = 1.0):
    h = (hex_str or "#b8a990").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
    except Exception:
        r, g, b = 0.72, 0.66, 0.56
    return (r ** 2.2, g ** 2.2, b ** 2.2, alpha)


def project_metric_box_uvs(obj, uv_scale: float = 0.5):
    """
    Applies metric triplanar/box UV projection in Blender so non-uniformly scaled walls,
    floors, and arches tile textures cleanly at real-world meter scale without UV stretching.
    """
    if not obj or obj.type != "MESH" or not obj.data:
        return
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        nx, ny, nz = abs(poly.normal.x), abs(poly.normal.y), abs(poly.normal.z)
        for loop_idx in poly.loop_indices:
            v_idx = mesh.loops[loop_idx].vertex_index
            co = mesh.vertices[v_idx].co
            if nz >= nx and nz >= ny:
                u, v = co.x * uv_scale, co.y * uv_scale
            elif nx >= ny and nx >= nz:
                u, v = co.y * uv_scale, co.z * uv_scale
            else:
                u, v = co.x * uv_scale, co.z * uv_scale
            uv_layer[loop_idx].uv = (u, v)


def make_pbr_material(
    name: str,
    hex_color: str = "#c2b59b",
    roughness: float = 0.55,
    metallic: float = 0.05,
    emission_hex: str = None,
    emission_strength: float = 0.0,
    texture_path: str = None,
    uv_scale: float = 1.0,
    alpha: float = 1.0,
):
    """
    Creates a Principled BSDF material with optional Nano Banana seamless image texture
    and metric UV scaling.
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat["uv_scale"] = float(uv_scale)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    if bsdf:
        rgba = hex_to_rgba(hex_color, alpha)
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = float(roughness)
        bsdf.inputs["Metallic"].default_value = float(metallic)
        if alpha < 0.999:
            mat.blend_method = "BLEND"
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = float(alpha)

        # Only bind direct image texture on light/medium surfaces where texture_path is provided
        # so glTF 2.0 exporter exports clean baseColorTexture without washing out dark carved stone
        if texture_path and os.path.exists(str(texture_path)):
            try:
                tex_node = nodes.new("ShaderNodeTexImage")
                tex_node.image = bpy.data.images.load(str(texture_path))
                links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
            except Exception as e:
                print(f"[BlenderToolchain] Texture bind warning ({texture_path}): {e}")

        if emission_hex and emission_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = hex_to_rgba(emission_hex)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = hex_to_rgba(emission_hex)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = float(emission_strength)
    return mat


def apply_uv_and_material(obj, mat, bevel_width: float = 0.006, bevel_segments: int = 2):
    uv_sc = 0.45
    if mat and "uv_scale" in mat:
        uv_sc = float(mat["uv_scale"]) * 0.25
    project_metric_box_uvs(obj, uv_scale=uv_sc)
    if bevel_width > 0:
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.width = float(bevel_width)
        mod.segments = int(bevel_segments)
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
    if mat:
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
    return obj


def create_box_at_three(
    name: str,
    tx: float,
    ty: float,
    tz: float,
    sx: float,
    sy: float,
    sz: float,
    mat=None,
    bevel_width: float = 0.006,
    rot_three=(0.0, 0.0, 0.0),
):
    """
    Create a 3D box centered at Three.js (tx, ty, tz) with Three.js dimensions (sx=width_X, sy=height_Y, sz=depth_Z).
    """
    bx, by, bz = three_to_blender(tx, ty, tz)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (max(0.008, float(sx)), max(0.008, float(sz)), max(0.008, float(sy)))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if any(abs(r) > 1e-4 for r in rot_three):
        rx, ry, rz = rot_three
        obj.rotation_euler = (float(rx), float(-rz), float(ry))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return apply_uv_and_material(obj, mat, bevel_width=bevel_width)


def create_cylinder_at_three(
    name: str,
    tx: float,
    ty: float,
    tz: float,
    radius_top: float,
    radius_bottom: float,
    height_y: float,
    mat=None,
    vertices: int = 24,
    bevel_width: float = 0.003,
    rot_three=(0.0, 0.0, 0.0),
):
    """
    Create a vertical cylinder/cone centered at Three.js (tx, ty, tz) with height along Three.js Y.
    """
    bx, by, bz = three_to_blender(tx, ty, tz)
    bpy.ops.mesh.primitive_cone_add(
        vertices=int(vertices),
        radius1=max(0.005, float(radius_bottom)),
        radius2=max(0.005, float(radius_top)),
        depth=max(0.008, float(height_y)),
        location=(bx, by, bz),
    )
    obj = bpy.context.active_object
    obj.name = name
    if any(abs(r) > 1e-4 for r in rot_three):
        rx, ry, rz = rot_three
        obj.rotation_euler = (float(rx), float(-rz), float(ry))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return apply_uv_and_material(obj, mat, bevel_width=bevel_width)


def create_arch_at_three(
    name: str,
    tx: float,
    ty: float,
    tz: float,
    span_width: float,
    arch_thickness: float,
    depth_z: float,
    mat=None,
    segments: int = 20,
    rot_y_deg: float = 0.0,
):
    """
    Creates a semicircular Romanesque/architectural stone arch ring centered at Three.js (tx, ty, tz)
    where (tx, ty, tz) is the springing line center of the arch opening.
    """
    bm = bmesh.new()
    r_inner = max(0.05, float(span_width) * 0.5)
    r_outer = r_inner + max(0.03, float(arch_thickness))
    half_d = max(0.02, float(depth_z) * 0.5)

    rings = []
    for i in range(segments + 1):
        theta = math.pi * (i / float(segments))
        c = math.cos(theta)
        s = math.sin(theta)
        # Local Three.js coords: x = c * r, y = s * r, z = +-half_d
        pts_local = [
            (c * r_inner, s * r_inner, -half_d),
            (c * r_outer, s * r_outer, -half_d),
            (c * r_outer, s * r_outer, +half_d),
            (c * r_inner, s * r_inner, +half_d),
        ]
        yaw = math.radians(float(rot_y_deg))
        cy, sy_ang = math.cos(yaw), math.sin(yaw)
        v_ring = []
        for lx, ly, lz in pts_local:
            wx = tx + lx * cy + lz * sy_ang
            wy = ty + ly
            wz = tz - lx * sy_ang + lz * cy
            bx, by, bz = three_to_blender(wx, wy, wz)
            v_ring.append(bm.verts.new((bx, by, bz)))
        rings.append(v_ring)

    for i in range(segments):
        a0, a1, a2, a3 = rings[i]
        b0, b1, b2, b3 = rings[i + 1]
        bm.faces.new((a0, b0, b1, a1))
        bm.faces.new((a1, b1, b2, a2))
        bm.faces.new((a2, b2, b3, a3))
        bm.faces.new((a3, b3, b0, a0))

    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bm.normal_update()

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return apply_uv_and_material(obj, mat, bevel_width=0.005)


def compute_scene_telemetry(ground_y_three: float = -1.25):
    """
    Computes exact 3D geometric telemetry in Three.js coordinates for all mesh objects in the scene:
      - Total vertices & triangles
      - Per-object Three.js AABB [minX, minY, minZ] to [maxX, maxY, maxZ]
      - Ground-contact gap (minY - ground_y_three)
      - Support-surface gap (vertical gap to ground_y_three or the highest supporting mesh directly below in X/Z)
    """
    bpy.context.view_layer.update()
    total_verts = 0
    total_tris = 0
    objects_report = []

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.data:
            continue
        mesh = obj.data
        v_count = len(mesh.vertices)
        t_count = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
        total_verts += v_count
        total_tris += t_count

        # Compute world-space corners and convert back to Three.js space
        corners_three = []
        for corner in obj.bound_box:
            w_pt = obj.matrix_world @ Vector(corner)
            tx, ty, tz = blender_to_three(w_pt.x, w_pt.y, w_pt.z)
            corners_three.append((tx, ty, tz))

        if corners_three:
            xs = [c[0] for c in corners_three]
            ys = [c[1] for c in corners_three]
            zs = [c[2] for c in corners_three]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            min_z, max_z = min(zs), max(zs)
            objects_report.append({
                "name": obj.name,
                "vertices": v_count,
                "triangles": t_count,
                "boundsThree": {
                    "min": [round(min_x, 3), round(min_y, 3), round(min_z, 3)],
                    "max": [round(max_x, 3), round(max_y, 3), round(max_z, 3)],
                    "center": [round((min_x + max_x) * 0.5, 3), round((min_y + max_y) * 0.5, 3), round((min_z + max_z) * 0.5, 3)],
                    "size": [round(max_x - min_x, 3), round(max_y - min_y, 3), round(max_z - min_z, 3)],
                },
                "groundElevationDeltaMeters": round(min_y - float(ground_y_three), 3),
            })

    # Compute supportGapMeters for each object against ground_y_three or underlying support geometry
    g_y = float(ground_y_three)
    for item in objects_report:
        b = item["boundsThree"]
        min_x, min_y, min_z = b["min"]
        max_x, max_y, max_z = b["max"]
        best_gap = min_y - g_y
        # Also check if top of slab is flush with ground_y_three (for recessed floor slabs)
        if abs(max_y - g_y) < abs(best_gap):
            best_gap = max_y - g_y
        for other in objects_report:
            if other["name"] == item["name"]:
                continue
            ob = other["boundsThree"]
            # Check horizontal X/Z overlap
            ox_overlap = min(max_x, ob["max"][0]) - max(min_x, ob["min"][0])
            oz_overlap = min(max_z, ob["max"][2]) - max(min_z, ob["min"][2])
            if ox_overlap > -0.05 and oz_overlap > -0.05:
                support_top = ob["max"][1]
                gap = min_y - support_top
                if -0.08 <= gap <= 0.35 and abs(gap) < abs(best_gap):
                    best_gap = gap
        item["supportGapMeters"] = round(best_gap, 3)

    return {
        "objectCount": len(objects_report),
        "totalVertices": total_verts,
        "totalTriangles": total_tris,
        "groundYThreeMeters": round(float(ground_y_three), 3),
        "objects": objects_report,
    }


def main():
    argv = sys.argv
    if "--" not in argv:
        print("Usage: blender --background --python blender_toolchain.py -- <spec.json> <out.glb> <out_script.py> [out_telemetry.json]")
        sys.exit(1)
    idx = argv.index("--")
    spec_path = Path(argv[idx + 1])
    out_glb_path = Path(argv[idx + 2])
    out_script_path = Path(argv[idx + 3])
    out_telemetry_path = Path(argv[idx + 4]) if len(argv) > idx + 4 else out_glb_path.with_suffix(".telemetry.json")

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    clear_scene()

    bpy_code = (spec.get("bpyCode") or spec.get("customBpyCode") or "").strip()
    textures = spec.get("textures") or {}
    ground_y = float(spec.get("groundYThree", -1.25))

    exec_globals = {
        "__name__": "__argon_bpy__",
        "bpy": bpy,
        "bmesh": bmesh,
        "math": math,
        "Vector": Vector,
        "Matrix": Matrix,
        "Euler": Euler,
        "TEXTURES": textures,
        "SPEC": spec,
        "three_to_blender": three_to_blender,
        "blender_to_three": blender_to_three,
        "hex_to_rgba": hex_to_rgba,
        "make_pbr_material": make_pbr_material,
        "create_box_at_three": create_box_at_three,
        "create_cylinder_at_three": create_cylinder_at_three,
        "create_arch_at_three": create_arch_at_three,
    }

    exec_error = None
    if bpy_code:
        try:
            exec(bpy_code, exec_globals)
        except Exception as e:
            exec_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            print(f"[BlenderToolchain ERROR executing Argon bpyCode]:\n{exec_error}", file=sys.stderr)

    telemetry = compute_scene_telemetry(ground_y_three=ground_y)
    telemetry["execError"] = exec_error
    if telemetry["totalVertices"] > MAX_VERTICES_LIMIT:
        raise RuntimeError(f"Scene exceeded vertex limit ({telemetry['totalVertices']} > {MAX_VERTICES_LIMIT})")

    header = [
        "# ============================================================================",
        "# Scene-Specific Headless Blender 4.1 (bpy) Script Authored by Gemini 4 Argon",
        f"# Stage / Round: {spec.get('stage', 'mvp3_round')}",
        f"# Compiled Objects: {telemetry['objectCount']} | Vertices: {telemetry['totalVertices']} | Triangles: {telemetry['totalTriangles']}",
        "# ============================================================================",
        "",
        bpy_code,
        "",
        f"bpy.ops.export_scene.gltf(filepath={str(out_glb_path)!r}, export_format='GLB', export_yup=True, export_apply=True)",
    ]
    out_script_path.write_text("\n".join(header), encoding="utf-8")

    out_glb_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_glb_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    telemetry["glbBytes"] = out_glb_path.stat().st_size if out_glb_path.exists() else 0
    out_telemetry_path.write_text(json.dumps(telemetry, indent=2), encoding="utf-8")
    print(f"[BlenderToolchain] Exported {out_glb_path.name} ({telemetry['glbBytes']} bytes, {telemetry['objectCount']} objects, {telemetry['totalTriangles']} tris)")


if __name__ == "__main__":
    main()
