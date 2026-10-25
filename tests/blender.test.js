const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const { validateBlenderResult } = require('../blender-result');

const blender = process.env.BLENDER_PATH || 'blender';
const available = spawnSync(blender, ['--version'], { encoding:'utf8', timeout:10000 }).status === 0;

test('CPU Blender exports real geometry and refuses broken or empty scenes', { skip: !available, timeout:90000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'timetravel-blender-'));
  try {
    const run = (name, code) => {
      const base = path.join(directory, name);
      fs.writeFileSync(`${base}.json`, JSON.stringify({ bpyCode:code, groundYThree:-1.72 }));
      const result = spawnSync(blender, ['--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1',
        '--python', path.join(__dirname, '..', 'blender_toolchain.py'), '--', `${base}.json`, `${base}.glb`, `${base}.py`, `${base}.telemetry.json`],
        { encoding:'utf8', timeout:25000, maxBuffer:8*1024*1024 });
      return { ...result, base, telemetry:JSON.parse(fs.readFileSync(`${base}.telemetry.json`, 'utf8')) };
    };
    const valid = run('valid', "mat = make_pbr_material('Glass', alpha=0.7)\nbpy.ops.mesh.primitive_cube_add(size=2, location=three_to_blender(0, 0, -5))\nbpy.context.object.data.materials.append(mat)");
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.equal(valid.telemetry.objectCount, 1);
    assert.equal(valid.telemetry.execError, null);
    assert.ok(valid.telemetry.totalTriangles >= 12);
    validateBlenderResult(`${valid.base}.glb`, valid.telemetry);
    const broken = run('broken', "bpy.ops.mesh.primitive_cube_add()\nraise RuntimeError('deliberate generation error')");
    assert.notEqual(broken.status, 0);
    assert.match(broken.telemetry.execError, /deliberate generation error/);
    assert.equal(fs.existsSync(`${broken.base}.glb`), false, 'Partial scenes must never be exported');
    assert.throws(() => validateBlenderResult(`${valid.base}.glb`, broken.telemetry), /generation error/);
    const empty = run('empty', '# No geometry');
    assert.notEqual(empty.status, 0);
    assert.match(empty.telemetry.execError, /no renderable mesh/);
    assert.equal(fs.existsSync(`${empty.base}.glb`), false);
    assert.throws(() => validateBlenderResult(`${valid.base}.glb`, {}), /no renderable mesh/);
    fs.writeFileSync(`${valid.base}.glb`, Buffer.from('invalid GLB'));
    assert.throws(() => validateBlenderResult(`${valid.base}.glb`, valid.telemetry), /invalid or incomplete/);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});
