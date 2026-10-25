const fs = require('fs');

// Treat an exporter exit status as only one part of readiness: old cache entries
// may contain valid GLB headers but no geometry after an earlier Python error.
function validateBlenderResult(glbPath, telemetry) {
  if (!telemetry || telemetry.execError || !(telemetry.objectCount > 0) ||
      !(telemetry.totalVertices >= 3) || !(telemetry.totalTriangles > 0)) {
    throw new Error(`Blender scene failed validation: ${telemetry?.execError || 'no renderable mesh geometry'}`);
  }
  const data = fs.readFileSync(glbPath);
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF' ||
      data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length ||
      data.readUInt32LE(16) !== 0x4e4f534a) {
    throw new Error('Blender exported an invalid or incomplete GLB');
  }
  const jsonLength = data.readUInt32LE(12);
  if (jsonLength > data.length - 20) throw new Error('Blender GLB JSON chunk is truncated');
  const document = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const meshes = document.meshes || [];
  const accessors = document.accessors || [];
  const hasGeometry = meshes.some(mesh => (mesh.primitives || []).some(primitive => {
    const position = accessors[primitive.attributes?.POSITION];
    return position?.type === 'VEC3' && position.count >= 3;
  }));
  if (!hasGeometry) throw new Error('Blender GLB has no renderable mesh primitives');
  return telemetry;
}

module.exports = { validateBlenderResult };
