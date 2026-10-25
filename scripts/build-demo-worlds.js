const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {YEARS,sceneCode}=require('../demo-worlds');
const {validateBlenderResult}=require('../blender-result');
const root=path.join(__dirname,'..');
const output=path.join(root,'samples','worlds');
fs.mkdirSync(output,{recursive:true});
const os=require('os'); const temp=fs.mkdtempSync(path.join(os.tmpdir(),'timetravel-demo-'));
try {
 const eras=YEARS.map(year=>{
  const source=sceneCode(year);
  const base=path.join(temp,String(year));
  fs.writeFileSync(base+'.json',JSON.stringify({bpyCode:source,groundYThree:-1.72}));
  const target=path.join(output,year+'.glb');
  const result=spawnSync(process.env.BLENDER_PATH||'blender',['--background','--factory-startup','--threads','2','--python-exit-code','1','--python',path.join(root,'blender_toolchain.py'),'--',base+'.json',target,base+'.py',base+'.telemetry.json'],{encoding:'utf8',timeout:45000});
  if(result.status!==0) throw new Error(result.stderr||result.stdout);
  const telemetry=JSON.parse(fs.readFileSync(base+'.telemetry.json','utf8'));
  validateBlenderResult(target,telemetry);
  console.log(`Generated ${year}: ${telemetry.objectCount} objects, ${telemetry.totalTriangles} triangles`);
  return {year,eraTitle:`${year} · Cloister courtyard`,provenance:'procedural_demo',narrative:'Illustrative CPU-generated architecture. Not a photograph reconstruction.',eraBpyCode:source,blenderGlbUrl:`/samples/worlds/${year}.glb`,blenderTelemetry:Object.fromEntries(["objectCount","totalVertices","totalTriangles","glbBytes","execError"].map(key=>[key,telemetry[key]]))};
 });
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({demo:true,provenance:'procedural_demo',eras},null,2)+'\n');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
