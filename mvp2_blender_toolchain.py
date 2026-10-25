"""
Headless Blender 4.1 Python (bpy) Procedural 3D Authoring Toolchain for
MVP2: Autonomous World Authoring and Causal Verification.

Executed via:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender_toolchain.py -- <spec.json> <out.glb> <out_script.py>

Provides:
  - Exact coordinate conversion from Three.js/MoGe-2 metric camera space (X right, Y up, -Z forward)
    to Blender world space (X right, Y forward, Z up) so glTF export (export_yup=True) aligns 1:1.
  - Multi-era procedural 3D authoring across:
      * 1926 Historical Environment (historical_1926)
      * 1956 Intermediate State 1 (intermediate_1956)
      * 1986 Intermediate State 2 (intermediate_1986)
      * 2026 Initial Alternate Present (counterfactual_2026_initial — pre-verification)
      * 2026 Repaired Alternate Present (counterfactual_2026_fixed — post-Argon geometric/causal fix)
  - Safe execution of Argon-authored `bpy` Python modeling code snippets.
"""

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def three_to_blender(x: float, y: float, z: float):
    """
    Convert Three.js (x, y, z) to Blender (x, -z, y) so glTF export (export_yup=True)
    maps back to exact Three.js (x, y, z).
    """
    return (float(x), float(-z), float(y))


def hex_to_rgba(hex_str: str, alpha: float = 1.0):
    h = (hex_str or "#8b5a2b").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
    except Exception:
        r, g, b = 0.55, 0.35, 0.17
    return (r ** 2.2, g ** 2.2, b ** 2.2, alpha)


def make_pbr_material(
    name: str,
    hex_color: str,
    roughness: float = 0.4,
    metallic: float = 0.1,
    emission_hex: str = None,
    emission_strength: float = 0.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = hex_to_rgba(hex_color)
        bsdf.inputs["Roughness"].default_value = float(roughness)
        bsdf.inputs["Metallic"].default_value = float(metallic)
        if emission_hex and emission_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = hex_to_rgba(emission_hex)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = hex_to_rgba(emission_hex)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = float(emission_strength)
    return mat


def add_bevel(obj, width: float = 0.008, segments: int = 3):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)


def create_box_at_three(
    name: str,
    tx: float,
    ty: float,
    tz: float,
    sx: float,
    sy: float,
    sz: float,
    mat,
    bevel_width: float = 0.006,
):
    """
    Create a beveled 3D box centered at Three.js (tx, ty, tz) with Three.js dimensions (sx, sy, sz).
    """
    bx, by, bz = three_to_blender(tx, ty, tz)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (max(0.01, sx), max(0.01, sz), max(0.01, sy))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width > 0:
        add_bevel(obj, width=bevel_width, segments=3)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj


def create_cylinder_at_three(
    name: str,
    tx: float,
    ty: float,
    tz: float,
    radius_top: float,
    radius_bottom: float,
    height_y: float,
    mat,
    vertices: int = 24,
):
    bx, by, bz = three_to_blender(tx, ty, tz)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=max(0.008, radius_bottom),
        radius2=max(0.008, radius_top),
        depth=max(0.01, height_y),
        location=(bx, by, bz),
    )
    obj = bpy.context.active_object
    obj.name = name
    add_bevel(obj, width=0.003, segments=2)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj


def build_ornate_molding_frame(
    obj_id: str,
    center,
    scale,
    primary_hex: str,
    accent_hex: str,
    stage: str = "counterfactual_2026_fixed",
    repair_patch: dict = None,
):
    """
    Builds a multi-profile architectural picture-frame & wall wainscoting molding around an object.
    Supports era-specific detailing (1926, 1956, 1986, 2026) and geometric inconsistency/repair parameters.
    """
    cx, cy, cz = center
    rp = repair_patch or {}

    if stage == "counterfactual_2026_initial":
        # Unverified Step 7 geometry: overly wide (1.48x) and extruded forward (+0.14m in Z),
        # causing the right stile & cornice to geometrically clip into the foreground flowering_branches_vase!
        width_mult = float(rp.get("frameWidthMultiplier", 1.48))
        z_offset = float(rp.get("frameZOffset", 0.14))
        x_shift = float(rp.get("frameXShift", 0.065))
    else:
        # Verified / Repaired Step 9 geometry (or historical eras): flush to wall (+0.025m) and tightly framed (1.14x)
        width_mult = float(rp.get("frameWidthMultiplier", 1.14))
        z_offset = float(rp.get("frameZOffset", 0.025))
        x_shift = float(rp.get("frameXShift", 0.0))

    cx_eff = cx + x_shift
    w = max(0.4, scale[0] * width_mult)
    h = max(0.4, scale[1] * 1.16)
    d = 0.045
    z_plane = cz + z_offset

    wood_mat = make_pbr_material(f"{obj_id}_walnut_{stage}", primary_hex or "#3b2212", roughness=0.35, metallic=0.08)
    brass_mat = make_pbr_material(f"{obj_id}_brass_{stage}", accent_hex or "#d4af37", roughness=0.25, metallic=0.85)

    frame_t = max(0.045, min(0.085, w * 0.08))
    # Outer architectural stiles and rails
    create_box_at_three(f"{obj_id}_stile_L", cx_eff - w / 2 - frame_t / 2, cy, z_plane, frame_t, h + frame_t * 2, d, wood_mat)
    create_box_at_three(f"{obj_id}_stile_R", cx_eff + w / 2 + frame_t / 2, cy, z_plane, frame_t, h + frame_t * 2, d, wood_mat)
    create_box_at_three(f"{obj_id}_rail_T", cx_eff, cy + h / 2 + frame_t / 2, z_plane, w, frame_t, d, wood_mat)
    create_box_at_three(f"{obj_id}_rail_B", cx_eff, cy - h / 2 - frame_t / 2, z_plane, w, frame_t, d, wood_mat)

    # Crown cornice pediment above top rail
    cornice_w = w + frame_t * 3.2
    cornice_h = frame_t * 0.85
    create_box_at_three(
        f"{obj_id}_cornice",
        cx_eff,
        cy + h / 2 + frame_t * 1.35,
        z_plane + 0.018,
        cornice_w,
        cornice_h,
        d * 1.45,
        wood_mat,
        bevel_width=0.01,
    )

    # Brass inner fillet inlay
    inlay_t = 0.014
    create_box_at_three(f"{obj_id}_brass_L", cx_eff - w / 2 + inlay_t / 2, cy, z_plane + 0.01, inlay_t, h, d * 0.8, brass_mat, bevel_width=0.002)
    create_box_at_three(f"{obj_id}_brass_R", cx_eff + w / 2 - inlay_t / 2, cy, z_plane + 0.01, inlay_t, h, d * 0.8, brass_mat, bevel_width=0.002)
    create_box_at_three(f"{obj_id}_brass_T", cx_eff, cy + h / 2 - inlay_t / 2, z_plane + 0.01, w, inlay_t, d * 0.8, brass_mat, bevel_width=0.002)
    create_box_at_three(f"{obj_id}_brass_B", cx_eff, cy - h / 2 + inlay_t / 2, z_plane + 0.01, w, inlay_t, d * 0.8, brass_mat, bevel_width=0.002)

    # Era-specific architectural accents for intermediate states
    if "1956" in stage:
        # 1956 Mid-Century floating brass shadow-reveal bar below frame
        create_box_at_three(f"{obj_id}_1956_brass_ledge", cx_eff, cy - h / 2 - frame_t * 1.4, z_plane + 0.02, w * 0.9, 0.022, 0.06, brass_mat)
    elif "1986" in stage:
        # 1986 Museum gallery brass picture-light fixture mounted above cornice
        light_mat = make_pbr_material(f"{obj_id}_1986_piclight", "#d4af37", roughness=0.22, metallic=0.9, emission_hex="#fef08a", emission_strength=0.45)
        create_box_at_three(f"{obj_id}_1986_gallery_hood", cx_eff, cy + h / 2 + frame_t * 2.3, z_plane + 0.06, w * 0.48, 0.032, 0.055, light_mat)


def build_club_chair_heritage_trim(
    obj_id: str,
    center,
    scale,
    primary_hex: str,
    accent_hex: str,
    stage: str = "counterfactual_2026_fixed",
    repair_patch: dict = None,
):
    """
    Adds carved walnut base plinth rail, turned bun feet, and brass nailhead trim accents
    anchored to the armchair's 3D footprint.
    In `counterfactual_2026_initial` (pre-fix), the plinth floats +0.13m too high (y_bottom_factor = -0.22)
    until Argon's Step 9 geometric repair snaps it flush to the MoGe-2 floor plane (y_bottom_factor = -0.43).
    """
    cx, cy, cz = center
    rp = repair_patch or {}
    w, h, d = max(0.5, scale[0] * 0.82), max(0.4, scale[1] * 0.78), max(0.3, scale[2] * 0.5)
    z_front = cz + 0.06

    if stage == "counterfactual_2026_initial":
        y_factor = float(rp.get("chairPlinthYFactor", -0.22))
    else:
        y_factor = float(rp.get("chairPlinthYFactor", -0.43))

    y_bottom = cy + h * y_factor

    walnut_mat = make_pbr_material(f"{obj_id}_walnut_trim_{stage}", primary_hex or "#4a2410", roughness=0.38, metallic=0.1)
    brass_mat = make_pbr_material(f"{obj_id}_brass_studs_{stage}", accent_hex or "#d4af37", roughness=0.25, metallic=0.85)

    # Carved lower walnut apron rail along front base of chair
    create_box_at_three(f"{obj_id}_apron_rail", cx, y_bottom + 0.08, z_front, w * 0.88, 0.045, 0.04, walnut_mat)
    create_box_at_three(f"{obj_id}_brass_inlay", cx, y_bottom + 0.08, z_front + 0.015, w * 0.84, 0.012, 0.02, brass_mat)

    # Turned walnut bun feet (or 1956 brass ferrules) at front corners
    foot_mat = brass_mat if "1956" in stage else walnut_mat
    create_cylinder_at_three(f"{obj_id}_foot_L", cx - w * 0.38, y_bottom, z_front, 0.032, 0.018, 0.11, foot_mat)
    create_cylinder_at_three(f"{obj_id}_foot_R", cx + w * 0.38, y_bottom, z_front, 0.032, 0.018, 0.11, foot_mat)


def build_vintage_lamp_assembly(
    obj_id: str,
    center,
    scale,
    primary_hex: str,
    accent_hex: str,
    stage: str = "counterfactual_2026_fixed",
):
    """
    Builds era-specific lamp head & finial assembly:
      - 1926: Warm pleated silk/parchment shade + turned bronze finial
      - 1956: Mid-century spun-brass conical atomic reflector shade
      - 1986: Heritage bronze halogen torchiere hood + dimmer collar
      - 2026: Preserved antique bronze & parchment shade assembly
    """
    cx, cy, cz = center
    w, h, _ = scale
    z_pos = cz + 0.05

    bronze_mat = make_pbr_material(f"{obj_id}_bronze_{stage}", primary_hex or "#6e4726", roughness=0.28, metallic=0.82)
    if "1956" in stage:
        shade_mat = make_pbr_material(
            f"{obj_id}_1956_spun_brass",
            "#d97706",
            roughness=0.26,
            metallic=0.78,
            emission_hex="#fde68a",
            emission_strength=0.28,
        )
        r_top, r_bot, sh_h = 0.04, 0.165, 0.16
    elif "1986" in stage:
        shade_mat = make_pbr_material(
            f"{obj_id}_1986_halogen_bronze",
            "#92400e",
            roughness=0.32,
            metallic=0.68,
            emission_hex="#fef08a",
            emission_strength=0.42,
        )
        r_top, r_bot, sh_h = 0.075, 0.135, 0.15
    else:
        shade_mat = make_pbr_material(
            f"{obj_id}_parchment_shade_{stage}",
            accent_hex or "#fef3c7",
            roughness=0.65,
            metallic=0.05,
            emission_hex="#fde68a",
            emission_strength=0.35,
        )
        r_top, r_bot, sh_h = 0.065, 0.145, 0.19

    shade_x = cx + w * 0.43
    shade_y = cy + h * 0.33
    create_cylinder_at_three(f"{obj_id}_shade", shade_x, shade_y, z_pos, radius_top=r_top, radius_bottom=r_bot, height_y=sh_h, mat=shade_mat, vertices=28)
    create_cylinder_at_three(f"{obj_id}_finial", shade_x, shade_y + sh_h * 0.58, z_pos, radius_top=0.01, radius_bottom=0.025, height_y=0.04, mat=bronze_mat, vertices=16)


def build_art_deco_radio_console(
    obj_id: str,
    center,
    scale,
    primary_hex: str,
    accent_hex: str,
    stage: str = "historical_1926",
):
    """
    Builds an era-appropriate acoustic/radio cabinet:
      - 1926: Art Deco walnut tabletop wireless radio receiver with brass dial & louver bars
      - 1956: Postwar mid-century mahogany Hi-Fi stereo tube console
      - 1986: Late-20th-century heritage timber cabinet trim rail
    """
    cx, cy, cz = center
    z_pos = cz + 0.06
    mahogany_mat = make_pbr_material(f"{obj_id}_mahogany_{stage}", primary_hex or "#451a03", roughness=0.36, metallic=0.1)
    brass_mat = make_pbr_material(f"{obj_id}_brass_dial_{stage}", accent_hex or "#d4af37", roughness=0.25, metallic=0.85)

    if "1956" in stage:
        rw, rh, rd = 0.48, 0.28, 0.20
    elif "1986" in stage:
        rw, rh, rd = 0.52, 0.22, 0.18
    else:
        rw, rh, rd = 0.34, 0.38, 0.18

    ry = cy + 0.12
    create_box_at_three(f"{obj_id}_radio_body", cx, ry, z_pos, rw, rh, rd, mahogany_mat, bevel_width=0.012)
    create_box_at_three(f"{obj_id}_radio_plinth", cx, ry - rh * 0.5, z_pos, rw * 1.08, 0.035, rd * 1.1, mahogany_mat)
    create_cylinder_at_three(f"{obj_id}_dial_main", cx, ry - 0.05, z_pos + rd * 0.52, 0.032, 0.032, 0.02, brass_mat)
    for i in (-1, 0, 1):
        create_box_at_three(
            f"{obj_id}_grille_{i}",
            cx + i * 0.06,
            ry + 0.05,
            z_pos + rd * 0.52,
            0.014,
            rh * 0.32,
            0.015,
            brass_mat,
            bevel_width=0.002,
        )


def main():
    argv = sys.argv
    if "--" not in argv:
        print("Usage: blender --background --python blender_toolchain.py -- <spec.json> <out.glb> <out_script.py>")
        sys.exit(1)
    idx = argv.index("--")
    spec_path = Path(argv[idx + 1])
    out_glb_path = Path(argv[idx + 2])
    out_script_path = Path(argv[idx + 3])

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    clear_scene()

    stage = spec.get("stage", "counterfactual_2026_fixed")
    repair_patch = spec.get("repairPatch") or {}

    script_lines = [
        "# Auto-Generated & Executed by Gemini 4 Argon + Blender 4.1.1 (bpy) Toolchain (MVP2)",
        f"# Stage: {stage}",
        f"# RepairPatch: {json.dumps(repair_patch)}",
        "import bpy, math",
        "from blender_toolchain import (",
        "    three_to_blender, make_pbr_material, create_box_at_three, create_cylinder_at_three,",
        "    build_ornate_molding_frame, build_club_chair_heritage_trim,",
        "    build_vintage_lamp_assembly, build_art_deco_radio_console",
        ")",
        "",
    ]

    items = spec.get("items", [])
    for item in items:
        obj_id = item.get("id", "obj")
        category = (item.get("category") or "").lower()
        archetype = (item.get("archetype") or "").lower()
        center = item.get("position", [0.0, 0.0, -3.0])
        scale = item.get("scale", [0.8, 0.8, 0.4])
        primary_hex = item.get("primaryHex", "#4a2c18")
        accent_hex = item.get("accentHex", "#d4af37")

        if "art" in obj_id or "frame" in archetype or "molding" in archetype or category == "decor" or "window" in obj_id:
            build_ornate_molding_frame(obj_id, center, scale, primary_hex, accent_hex, stage=stage, repair_patch=repair_patch)
            script_lines.append(
                f"build_ornate_molding_frame({obj_id!r}, {center!r}, {scale!r}, {primary_hex!r}, {accent_hex!r}, stage={stage!r}, repair_patch={repair_patch!r})"
            )
        elif "lamp" in obj_id or category == "lighting":
            build_vintage_lamp_assembly(obj_id, center, scale, primary_hex, accent_hex, stage=stage)
            script_lines.append(
                f"build_vintage_lamp_assembly({obj_id!r}, {center!r}, {scale!r}, {primary_hex!r}, {accent_hex!r}, stage={stage!r})"
            )
        elif "tv" in obj_id or "media" in obj_id or "radio" in archetype:
            build_art_deco_radio_console(obj_id, center, scale, primary_hex, accent_hex, stage=stage)
            script_lines.append(
                f"build_art_deco_radio_console({obj_id!r}, {center!r}, {scale!r}, {primary_hex!r}, {accent_hex!r}, stage={stage!r})"
            )
        elif "chair" in obj_id or category == "furniture":
            build_club_chair_heritage_trim(obj_id, center, scale, primary_hex, accent_hex, stage=stage, repair_patch=repair_patch)
            script_lines.append(
                f"build_club_chair_heritage_trim({obj_id!r}, {center!r}, {scale!r}, {primary_hex!r}, {accent_hex!r}, stage={stage!r}, repair_patch={repair_patch!r})"
            )
        else:
            build_ornate_molding_frame(obj_id, center, scale, primary_hex, accent_hex, stage=stage, repair_patch=repair_patch)
            script_lines.append(
                f"build_ornate_molding_frame({obj_id!r}, {center!r}, {scale!r}, {primary_hex!r}, {accent_hex!r}, stage={stage!r}, repair_patch={repair_patch!r})"
            )

    custom_bpy = spec.get("customBpyCode", "").strip()
    if custom_bpy:
        script_lines.append("\n# Argon Custom bpy Authoring Block:")
        script_lines.append(custom_bpy)
        try:
            exec(
                custom_bpy,
                {
                    "bpy": bpy,
                    "bmesh": bmesh,
                    "math": math,
                    "Vector": Vector,
                    "three_to_blender": three_to_blender,
                    "make_pbr_material": make_pbr_material,
                    "create_box_at_three": create_box_at_three,
                    "create_cylinder_at_three": create_cylinder_at_three,
                },
            )
        except Exception as e:
            print(f"[BlenderToolchain] Warning executing customBpyCode: {e}")

    script_lines.append(f"\nbpy.ops.export_scene.gltf(filepath={str(out_glb_path)!r}, export_format='GLB', export_yup=True)")
    out_script_path.write_text("\n".join(script_lines), encoding="utf-8")

    out_glb_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_glb_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"[BlenderToolchain] Successfully exported {out_glb_path} ({out_glb_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
