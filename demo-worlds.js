// Curated procedural worlds for a reliable CPU-only demonstration. No AI claims.
const YEARS = [1206, 1566, 1938, 2026];
function interventionType(text) {
  if (/astrolabe|sundial|balustrade/i.test(text)) return 'astrolabe';
  if (/lavabo|canopy|fountain|well/i.test(text)) return 'lavabo';
  if (/garden|tree|plant/i.test(text)) return 'garden';
  throw Object.assign(new Error('Procedural demo supports fountain/canopy, astrolabe, or garden interventions. Arbitrary authoring requires the live AI workflow.'), {status:400});
}
function parseSource(source) {
  const line = String(source || '').split('\n').find(line => line.startsWith('# TIME_TRAVEL_DEMO '));
  if (!line) throw Object.assign(new Error('Selected world has no procedural source. Choose the illustrative root or use live generation.'), {status:400});
  const data = JSON.parse(line.slice('# TIME_TRAVEL_DEMO '.length));
  if (!Array.isArray(data.interventions)) throw new Error('Invalid demo source');
  return data;
}
function sceneCode(year, interventions = []) {
  const metadata = {version:2,year,interventions};
  // Interventions are structured data, never interpolated as executable user text.
  return `# TIME_TRAVEL_DEMO ${JSON.stringify(metadata)}
import bpy, math
from mathutils import Vector
YEAR = ${Number(year)}
INTERVENTIONS = ${JSON.stringify(interventions).replace(/true/g, 'True').replace(/false/g,'False').replace(/null/g,'None')}
def material(name, color, metallic=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=.72
    bsdf.inputs['Metallic'].default_value=metallic
    return m
stone=material('Honey limestone',(.58,.46,.31))
floor=material('Courtyard paving',(.33,.34,.28))
bronze=material('Aged bronze',(.16,.31,.23),.7)
marble=material('Carved marble',(.79,.76,.65))
green=material('Garden foliage',(.08,.23,.11))
def box(name,location,scale,mat=stone):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(mat); return o
def cylinder(name,location,radius,depth,mat=stone):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=location)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat); return o
def ring(name,location,radius,minor,mat=stone,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=10,major_radius=radius,minor_radius=minor,location=location)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    if rotation: o.rotation_euler=rotation
    return o
def arch(x,y):
    # Segmented semicircular vault connecting neighboring arcade columns.
    for i in range(12):
        a=(i+.5)*math.pi/12
        o=box('Arcade arch voussoir',(x,y+1.5*math.cos(a),1.1+1.5*math.sin(a)),(.5,.45,.32))
        o.rotation_euler.x=a
box('Courtyard floor',(0,7,-1.85),(14,16,.25),floor)
for x in [-5,5]:
    for y in [2,5,8,11,14]:
        cylinder('Arcade column',(x,y,-.35),.20,2.8)
        box('Column capital',(x,y,1.12),(.6,.6,.28))
        box('Column base',(x,y,-1.55),(.55,.55,.3))
    for y in [3.5,6.5,9.5,12.5]: arch(x,y)
    box('Arcade cornice',(x,8,2.9),(.7,14,.35))
box('Rear wall',(0,15,1),(11,.5,5.5))
cylinder('Wellhead base',(0,7,-1.45),1.1,.6)
ring('Wellhead rim',(0,7,-1.08),1.0,.16)
if YEAR>=1566: box('Renaissance plinth',(0,7,-1.65),(2.8,2.8,.2),marble)
if YEAR>=1938:
    for y in [2,5,8,11,14]: box('Museum roof beam',(0,y,3.2),(11,.16,.2))
if YEAR>=2026:
    for x in [-3,3]: cylinder('Contemporary planter',(x,10,-1.3),.45,.8)
for change in INTERVENTIONS:
    if YEAR < change['year']: continue
    if change['type']=='lavabo':
        for x,y in [(-1.45,5.55),(-1.45,8.45),(1.45,5.55),(1.45,8.45)]:
            cylinder('Lavabo pavilion column',(x,y,-.05),.13,3.4,marble)
        bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=2.45,radius2=.22,depth=1.0,location=(0,7,2.15))
        bpy.context.object.name='Lavabo bronze canopy'; bpy.context.object.data.materials.append(bronze)
        ring('Fountain basin',(0,7,-.55),.83,.18,marble)
        cylinder('Fountain central jet',(0,7,-.1),.07,.9,bronze)
    elif change['type']=='astrolabe':
        cylinder('Astrolabe marble pedestal',(2.6,7,-.65),.32,2.1,marble)
        ring('Astrolabe equatorial ring',(2.6,7,.7),.7,.06,bronze,(math.pi/3,0,0))
        ring('Astrolabe meridian',(2.6,7,.7),.7,.045,bronze,(math.pi/2,0,0))
    elif change['type']=='garden':
        for x,y in [(-3,5),(3,5),(-3,11),(3,11)]:
            cylinder('Garden tree trunk',(x,y,-.4),.12,2.5)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.8,location=(x,y,1.1))
            bpy.context.object.name='Garden tree crown'; bpy.context.object.data.materials.append(green)
`;
}
function planFork({forkYear,interventionText,interventionPrompt,verifiedBpyCode}) {
  const year=Number(forkYear);
  if (!Number.isInteger(year) || year<1100 || year>2026) throw Object.assign(new Error('Fork year must be an integer from 1100 to 2026'),{status:400});
  const parent=parseSource(verifiedBpyCode);
  const type=interventionType(String(interventionPrompt||interventionText||''));
  const interventions=parent.interventions.filter(i=>Number(i.year)<=year);
  interventions.push({year,type});
  const years=[...new Set([year,...YEARS.filter(y=>y>=year)])].sort((a,b)=>a-b);
  return {demo:true,branchTitle:type==='astrolabe'?'Renaissance astrolabe':type==='garden'?'Courtyard garden':'Lavabo pavilion',
    intervention:String(interventionText),causalChainSummary:`Procedural ${type} intervention at ${year}; inherited prior interventions remain in later worlds.`,
    provenance:'procedural_demo',eras:years.map(y=>({year:y,eraTitle:`${y} · ${type==='astrolabe'?'Astrolabe':type==='garden'?'Garden':'Lavabo pavilion'}`,
      provenance:'procedural_demo',narrative:`Illustrative CPU-generated world, holding interventions from ${year}. Not a measured reconstruction.`,eraBpyCode:sceneCode(y,interventions)}))};
}
module.exports={YEARS,sceneCode,planFork,parseSource};
