"""Generate explicit illustrative assets; these are not measured reconstructions."""
import bpy, json, math
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'samples/worlds'
out.mkdir(exist_ok=True)
eras=[]
for year in [1206,1566,1938,2026]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone=bpy.data.materials.new('Warm limestone'); stone.diffuse_color=(0.64,0.52,0.36,1)
    def box(name, location, scale):
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        obj=bpy.context.object; obj.name=name; obj.scale=scale; obj.data.materials.append(stone)
    box('Courtyard floor',(0,7,-1.85),(14,16,.25))
    for x in [-5,5]:
        for y in [2,5,8,11,14]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.22, depth=3.5, location=(x,y,0))
            bpy.context.object.name='Arcade column'; bpy.context.object.data.materials.append(stone)
        box('Arcade cornice',(x,8,1.9),(.65,14,.45))
    box('Rear wall',(0,15,1),(11,.5,5.5))
    bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=.18,location=(0,7,-.9))
    bpy.context.object.name='Wellhead'; bpy.context.object.data.materials.append(stone)
    if year>=1566: box('Renaissance plinth',(0,7,-1.45),(2.6,2.6,.45))
    if year>=1938:
        for y in [2,5,8,11,14]: box('Museum roof beam',(0,y,2.5),(11,.15,.2))
    if year>=2026:
        for x in [-3,3]: box('Contemporary planter',(x,10,-1.2),(.8,.8,1))
    bpy.ops.export_scene.gltf(filepath=str(out/f'{year}.glb'),export_format='GLB',export_yup=True)
    eras.append({'year':year,'eraTitle':f'{year} illustrative courtyard','blenderGlbUrl':f'/samples/worlds/{year}.glb'})
(out/'manifest.json').write_text(json.dumps({'provenance':'Procedural illustrative demo, not AI reconstruction','eras':eras},indent=2))
