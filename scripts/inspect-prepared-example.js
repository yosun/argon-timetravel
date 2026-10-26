// Local, read-only artifact verification. Never submits inference or Blender jobs.
const fs = require('node:fs/promises');
const path = require('node:path');
const {load} = require('../prepared-examples');

(async () => {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/inspect-prepared-example.js /path/to/manifest.json');
  const manifestPath = await fs.realpath(process.argv[2]);
  const directory = path.dirname(manifestPath);
  if ((await fs.stat(manifestPath)).size > 1024 * 1024) throw new Error('Manifest exceeds 1 MiB');
  const loaded = await load(JSON.parse(await fs.readFile(manifestPath, 'utf8')), {readArtifact:async artifact => {
    const filename = await fs.realpath(path.join(directory, artifact.path));
    if (!filename.startsWith(directory + path.sep)) throw new Error('Artifact symlink escapes the manifest directory');
    const info = await fs.stat(filename);
    if (!info.isFile() || info.size !== artifact.bytes) throw new Error('Artifact file/byte length differs');
    return fs.readFile(filename);
  }});
  console.log(JSON.stringify({id:loaded.manifest.id, title:loaded.manifest.title, representedYear:loaded.manifest.year,
    worldSha256:loaded.manifest.artifacts[loaded.manifest.world.artifactId].sha256,
    verifiedArtifactCount:Object.keys(loaded.manifest.artifacts).length, glb:loaded.glb,
    promotion:loaded.promotion, limitation:'Checks artifact integrity and linked evidence. Does not judge images or reproduce the recorded critic.'}, null, 2));
})().catch(error => {console.error(error.message); process.exitCode = 1;});
