// Evidence checks for prepared examples. These checks cannot judge image quality.
(function(root) {
  const VIEWS = Object.freeze(['originalCam', 'threeQuarter', 'lowAngle', 'clockDetail', 'wireframe']);
  const SHA = /^[a-f0-9]{64}$/;
  const IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
  const verified = new WeakSet();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = bytes => new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  function relativePath(value) {
    return typeof value === 'string' && value.length > 0 && !/[\\:%?#\x00-\x20]/.test(value) && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');
  }
  function camera(value) {
    return object(value) && ['position','lookAt'].every(key => Array.isArray(value[key]) && value[key].length === 3 && value[key].every(Number.isFinite)) && Number.isFinite(value.fovYDeg) && value.fovYDeg > 0 && value.fovYDeg < 180;
  }
  function validateManifest(input) {
    const m = copy(input);
    assert(m.schemaVersion === 1, 'Unsupported prepared-example schemaVersion');
    assert(typeof m.id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(m.id), 'Invalid prepared-example id');
    assert(typeof m.title === 'string' && m.title.trim(), 'Example title is required');
    assert(m.provenance === 'generated_prepared_example', 'Prepared-example provenance must remain explicit');
    assert(Number.isInteger(m.year), 'Explicit represented year is required; historical eras are not inferred');
    assert(typeof m.narrative === 'string' && m.narrative.trim(), 'Example narrative is required');
    assert(object(m.artifacts), 'Example artifacts are required');
    for (const [id, artifact] of Object.entries(m.artifacts)) {
      assert(/^[a-zA-Z0-9_-]+$/.test(id) && object(artifact), 'Invalid artifact record');
      assert(relativePath(artifact.path), `Artifact ${id} must use a safe relative path`);
      assert(SHA.test(artifact.sha256), `Artifact ${id} needs a lowercase SHA-256`);
      assert(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes <= MAX_ARTIFACT_BYTES, `Artifact ${id} has an invalid byte length`);
      assert(typeof artifact.mediaType === 'string' && artifact.mediaType, `Artifact ${id} needs a media type`);
    }
    const artifact = (id, type) => {
      const a = m.artifacts[id];
      assert(a && (!type || a.mediaType === type), `Missing or invalid ${id || 'referenced'} artifact`);
      return a;
    };
    assert(object(m.source) && m.source.selfContained === true && Array.isArray(m.source.assetIds), 'Source and its complete asset list must be declared self-contained');
    artifact(m.source.artifactId, 'text/x-python');
    m.source.assetIds.forEach(id => artifact(id));
    assert(object(m.world), 'Exported world is required');
    const world = artifact(m.world.artifactId, 'model/gltf-binary');
    assert(world.path.split('/').pop().includes(world.sha256) && world.path.endsWith('.glb'), 'World filename must include its complete SHA-256 for immutable URLs');
    assert(m.world.sourceSha256 === artifact(m.source.artifactId).sha256, 'World must identify its exact source SHA-256');
    assert(object(m.context) && IMAGE.has(artifact(m.context.referenceArtifactId).mediaType), 'Source reference photograph is required');
    assert(object(m.context.metricSummary), 'Source metricSummary is required (an empty object may explicitly mean uncalibrated)');
    assert(object(m.context.cameraPresets) && camera(m.context.cameraPresets.originalCam), 'Explicit original camera calibration is required');
    for (const value of Object.values(m.context.cameraPresets)) assert(camera(value), 'Invalid camera preset');
    assert(Array.isArray(m.targetArtifactIds), 'Declare targetArtifactIds, including an empty list if there are none');
    m.targetArtifactIds.forEach(id => assert(IMAGE.has(artifact(id).mediaType), `Target ${id} must be an image`));
    if (m.renderSet) {
      const r = m.renderSet;
      assert(typeof r.id === 'string' && r.id && SHA.test(r.glbSha256) && SHA.test(r.sha256), 'Invalid render-set identity');
      assert(object(r.renderer) && r.renderer.name && r.renderer.version && r.renderer.device, 'Render engine/version/device are required');
      assert(date(r.recordedAt) && object(r.views), 'Render timestamp and views are required');
      artifact(r.workerArtifactId, 'text/x-python');
      for (const [view, record] of Object.entries(r.views)) {
        assert(object(record) && IMAGE.has(artifact(record.artifactId).mediaType) && camera(record.camera), `Invalid rendered ${view} view`);
      }
    }
    if (m.critic) {
      const c = m.critic;
      artifact(c.artifactId, 'application/json');
      assert(c.provider && c.model && date(c.recordedAt), 'Critic provider/model/timestamp are required');
      assert(typeof c.scorePointer === 'string' && c.scorePointer.startsWith('/'), 'Critic scorePointer must identify the numeric score in the raw JSON response');
      assert(typeof c.acceptancePointer === 'string' && c.acceptancePointer.startsWith('/'), 'Critic acceptancePointer must identify its actual acceptance boolean');
      assert(c.blockingFindingsPointer === undefined || (typeof c.blockingFindingsPointer === 'string' && c.blockingFindingsPointer.startsWith('/')), 'Invalid blocking-findings JSON pointer');
      assert(c.scale === 10 && Number.isFinite(c.score) && c.score >= 0 && c.score <= 10, 'Critic score must use a 0–10 scale');
      assert([10, 100].includes(c.sourceScale ?? 10), 'Critic sourceScale must explicitly preserve the raw 10- or 100-point scale');
      assert(SHA.test(c.glbSha256) && typeof c.renderSetId === 'string' && SHA.test(c.renderSetSha256), 'Critic must identify the world and actual render set');
    }
    if (m.review) {
      assert(['unverified','rejected','accepted'].includes(m.review.status), 'Invalid cloud rendered-review status');
      assert(m.review.executionHost === 'cloud' && m.review.reviewer && date(m.review.recordedAt), 'Cloud review host/reviewer/timestamp are required');
      assert(SHA.test(m.review.glbSha256) && typeof m.review.renderSetId === 'string' && SHA.test(m.review.renderSetSha256) && SHA.test(m.review.criticSha256), 'Cloud review must identify the exact world, render set and critic');
    }
    return freeze(m);
  }
  function jsonPointer(value, pointer) {
    for (const part of pointer.slice(1).split('/')) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!object(value) && !Array.isArray(value)) return undefined;
      if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
      value = value[key];
    }
    return value;
  }
  function inspectGlb(bytes) {
    assert(bytes.byteLength >= 20, 'Exported GLB is truncated');
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert(data.getUint32(0, true) === 0x46546c67 && data.getUint32(4, true) === 2 && data.getUint32(8, true) === bytes.byteLength, 'Invalid GLB 2 header');
    const length = data.getUint32(12, true);
    assert(data.getUint32(16, true) === 0x4e4f534a && length % 4 === 0 && 20 + length <= bytes.byteLength, 'Missing GLB JSON chunk');
    const gltf = JSON.parse(text(bytes.subarray(20, 20 + length)));
    let binary;
    for (let offset = 20 + length; offset < bytes.byteLength;) {
      assert(offset + 8 <= bytes.byteLength, 'GLB chunk header is truncated');
      const size = data.getUint32(offset, true), type = data.getUint32(offset + 4, true);
      assert(size % 4 === 0 && offset + 8 + size <= bytes.byteLength, 'GLB chunk is truncated or unaligned');
      if (type === 0x004e4942) {
        assert(!binary, 'GLB has duplicate binary chunks');
        binary = bytes.subarray(offset + 8, offset + 8 + size);
      }
      offset += 8 + size;
    }
    const buffer = gltf.buffers?.[0];
    assert(binary && buffer && !buffer.uri && Number.isSafeInteger(buffer.byteLength) && buffer.byteLength > 0 && buffer.byteLength <= binary.byteLength && binary.byteLength - buffer.byteLength <= 3, 'GLB mesh needs an actual complete embedded binary buffer');
    for (const a of [...(gltf.buffers || []), ...(gltf.images || [])]) assert(!a.uri || a.uri.startsWith('data:'), 'Prepared GLB has external buffer/image dependencies');
    const integer = value => Number.isSafeInteger(value) && value >= 0;
    const accessorRange = (index, position) => {
      if (!integer(index)) return null;
      const a = gltf.accessors?.[index], view = gltf.bufferViews?.[a?.bufferView];
      if (!a || a.sparse || !integer(a.bufferView) || !view || view.buffer !== 0 || !integer(view.byteOffset ?? 0) || !integer(view.byteLength) || !integer(a.byteOffset ?? 0) || !Number.isSafeInteger(a.count) || a.count < 3) return null;
      const componentBytes = {5121:1,5123:2,5125:4,5126:4}[a.componentType];
      if (!componentBytes || (position ? a.type !== 'VEC3' || a.componentType !== 5126 : a.type !== 'SCALAR' || a.componentType === 5126)) return null;
      if (view.target !== undefined && view.target !== (position ? 34962 : 34963)) return null;
      const elementBytes = componentBytes * (position ? 3 : 1), stride = view.byteStride ?? elementBytes;
      const start = view.byteOffset ?? 0, accessorOffset = a.byteOffset ?? 0;
      if (!integer(stride) || stride < elementBytes || stride > 252 || stride % componentBytes || start % componentBytes || accessorOffset % componentBytes || start + view.byteLength > buffer.byteLength || accessorOffset + (a.count - 1) * stride + elementBytes > view.byteLength) return null;
      return a;
    };
    const hasGeometry = gltf.asset?.version === '2.0' && gltf.meshes?.some(mesh => mesh.primitives?.some(p => {
      const position = accessorRange(p.attributes?.POSITION, true), mode = p.mode ?? 4;
      if (!position || ![4,5,6].includes(mode)) return false;
      const indices = p.indices === undefined ? null : accessorRange(p.indices, false);
      if (p.indices !== undefined && !indices) return false;
      return mode !== 4 || (indices?.count ?? position.count) % 3 === 0;
    }));
    assert(hasGeometry, 'GLB has no renderable mesh primitives with complete POSITION/index buffer ranges');
    return freeze({embeddedImages:(gltf.images || []).length, materials:(gltf.materials || []).length, texturedBaseColors:(gltf.materials || []).filter(m => m.pbrMetallicRoughness?.baseColorTexture).length});
  }
  async function sha256(bytes) {
    if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  // Hash this UTF-8 receipt after finalizing the actual render artifacts.
  function renderSetIdentity(m) {
    const {sha256:ignored, ...render} = m.renderSet;
    return canonical({...render, workerSha256:m.artifacts[render.workerArtifactId].sha256,
      views:Object.fromEntries(Object.entries(render.views).map(([key, value]) => [key, {...value, imageSha256:m.artifacts[value.artifactId].sha256}]))});
  }
  function eligibility(m, loaded, verifiedRenderSetSha) {
    const reasons = [];
    let criticRejected = false;
    const glb = m.artifacts[m.world.artifactId].sha256;
    const r = m.renderSet, c = m.critic, review = m.review;
    if (!r || r.method !== 'exported-glb-reimport' || r.glbSha256 !== glb) reasons.push('Missing actual exported-GLB reimport render evidence for this world.');
    if (r && r.sha256 !== verifiedRenderSetSha) reasons.push('Immutable render-set receipt has not been verified.');
    if (!r || VIEWS.some(view => !r.views[view])) reasons.push('Five actual diagnostic views, including a detail close-up, are required.');
    if (!m.targetArtifactIds.length) reasons.push('Visual comparison targets have not been supplied.');
    if (!c || c.independent !== true || c.glbSha256 !== glb || c.renderSetId !== r?.id || c.renderSetSha256 !== r?.sha256) reasons.push('Independent critic evidence must reference this world and render set.');
    if (!c?.blockingFindingsPointer) reasons.push('Critic must identify its actual findings array before promotion.');
    if (!c || c.score < 9 || c.scale !== 10) reasons.push('Recorded independent rendered acceptance must be at least 9/10.');
    if (c && loaded) {
      const response = JSON.parse(text(loaded[c.artifactId]));
      const raw = jsonPointer(response, c.scorePointer);
      if (!Number.isFinite(raw) || Math.abs(raw / (c.sourceScale ?? 10) * 10 - c.score) > 1e-9) reasons.push('Recorded score differs from the linked raw critic response.');
      const accepted = jsonPointer(response, c.acceptancePointer);
      if (accepted !== true) reasons.push('The linked actual critic response has not accepted this result.');
      criticRejected = accepted === false;
      if (c.blockingFindingsPointer) {
        const findings = jsonPointer(response, c.blockingFindingsPointer);
        if (!Array.isArray(findings) || findings.some(finding =>
          !/^(critical|high|blocker|release[ _-]?blocking|medium|low)$/i.test(String(finding?.severity).trim()) ||
          /^(critical|high|blocker|release[ _-]?blocking)$/i.test(String(finding?.severity).trim()))) {
          reasons.push('The actual critic response contains unresolved blocking findings.');
          criticRejected = true;
        }
      }
    }
    if (!review || review.status !== 'accepted' || review.executionHost !== 'cloud' || review.glbSha256 !== glb || review.renderSetId !== r?.id || review.renderSetSha256 !== r?.sha256 || review.criticSha256 !== m.artifacts[c?.artifactId]?.sha256) reasons.push('Cloud rendered review has not accepted these exact artifacts.');
    if (!loaded) reasons.push('Artifact bytes and hashes have not been verified.');
    return freeze({eligible:reasons.length === 0, minimumScore:9, reasons, label:reasons.length === 0 ? 'RECORDED RENDERED ACCEPTANCE' : criticRejected || review?.status === 'rejected' || (c && c.score < 9) ? 'REJECTED PREPARED DRAFT · NOT DEMO APPROVED' : 'UNVERIFIED PREPARED EXAMPLE · NOT DEMO APPROVED'});
  }
  async function load(input, {readArtifact, maxTotalBytes = 1024 * 1024 * 1024} = {}) {
    const manifest = validateManifest(input);
    assert(typeof readArtifact === 'function', 'readArtifact is required');
    assert(Object.values(manifest.artifacts).reduce((sum, a) => sum + a.bytes, 0) <= maxTotalBytes, 'Example exceeds the artifact byte budget');
    const loaded = Object.create(null);
    // Sequential reads avoid multiplying large GLB/texture memory requirements.
    for (const [id, artifact] of Object.entries(manifest.artifacts)) {
      const data = await readArtifact(artifact);
      assert(data instanceof Uint8Array, `Artifact ${id} did not return bytes`);
      assert(data.byteLength === artifact.bytes, `Artifact ${id} byte length differs`);
      assert(await sha256(data) === artifact.sha256, `Artifact ${id} SHA-256 differs`);
      loaded[id] = data;
    }
    const source = text(loaded[manifest.source.artifactId]);
    assert(source.trim(), 'Prepared source is empty');
    const glb = inspectGlb(loaded[manifest.world.artifactId]);
    const renderSetSha = manifest.renderSet ? await sha256(new TextEncoder().encode(renderSetIdentity(manifest))) : undefined;
    const promotion = eligibility(manifest, loaded, renderSetSha);
    const result = Object.freeze({manifest, source, glb, promotion, artifacts:loaded});
    verified.add(result);
    return result;
  }
  async function loadFromUrl(url, {fetch:fetcher = root.fetch?.bind(root), ...options} = {}) {
    assert(typeof fetcher === 'function', 'fetch is required');
    const base = new URL(url, root.location?.href);
    const response = await fetcher(base.href, {credentials:'same-origin'});
    assert(response.ok, `Example manifest HTTP ${response.status}`);
    return load(await response.json(), {...options, readArtifact:async artifact => {
      const target = new URL(artifact.path, base);
      assert(target.origin === base.origin, 'Artifact escaped its manifest origin');
      const result = await fetcher(target.href, {credentials:'same-origin'});
      assert(result.ok, `Artifact HTTP ${result.status}`);
      return new Uint8Array(await result.arrayBuffer());
    }});
  }
  function imageDataUrl(bytes, mediaType) {
    if (typeof Buffer !== 'undefined') return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return `data:${mediaType};base64,${root.btoa(binary)}`;
  }
  function toHistoryBundle(loaded, {artifactUrl}) {
    assert(verified.has(loaded), 'Load and verify the example before creating a history bundle');
    const m = loaded.manifest, hash = m.artifacts[m.world.artifactId].sha256;
    assert(typeof artifactUrl === 'function', 'artifactUrl is required');
    const reference = m.artifacts[m.context.referenceArtifactId];
    const photoDataUrl = imageDataUrl(loaded.artifacts[m.context.referenceArtifactId], reference.mediaType);
    const id = `prepared-${m.id}-${hash}`;
    const contextId = `${id}-source-${m.artifacts[m.source.artifactId].sha256}`;
    const branch = {id, parentId:null, forkYear:null, contextId, branchTitle:m.title, demo:false,
      preparedExample:true, provenance:m.provenance, visualAcceptance:loaded.promotion,
      // One recorded year means one state. Never fabricate the other timeline eras.
      eras:[{year:m.year, eraTitle:m.title, provenance:m.provenance, narrative:`${loaded.promotion.label}. ${m.narrative}`, eraBpyCode:loaded.source, blenderGlbUrl:artifactUrl(m.artifacts[m.world.artifactId]), glbSha256:hash}]};
    const context = {photoDataUrl, samplePath:artifactUrl(m.artifacts[m.context.referenceArtifactId]), metricSummary:copy(m.context.metricSummary), cameraPresets:copy(m.context.cameraPresets), preparedExampleId:m.id, targetArtifactUrls:m.targetArtifactIds.map(key => artifactUrl(m.artifacts[key]))};
    return freeze({branch, contextId, context, promotion:loaded.promotion});
  }
  const api = {VIEWS, validateManifest, inspectGlb, renderSetIdentity, eligibility, load, loadFromUrl, toHistoryBundle};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PreparedExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
