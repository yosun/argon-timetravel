const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DEFAULT_MODEL = 'gemini-4-argon';
const API_ORIGIN = 'https://generativelanguage.googleapis.com';
const BRIDGE = path.join(__dirname, 'scripts', 'gemini-request.py');
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

function redact(value, env = process.env) {
  let result = String(value ?? '');
  if (env.GEMINI_API_KEY) result = result.split(env.GEMINI_API_KEY).join('[REDACTED]');
  return result.replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/((?:x-goog-api-key|GEMINI_API_KEY|api[_ -]?key)\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]');
}

function getConfig(env = process.env) {
  const rawModel = String(env.GEMINI_MODEL === undefined ? DEFAULT_MODEL : env.GEMINI_MODEL).trim().replace(/^models\//, '');
  const model = redact(rawModel, env);
  const validModel = model === rawModel && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model);
  return {
    provider: 'gemini', model, hasApiKey: Boolean(env.GEMINI_API_KEY?.trim()),
    endpointUrl: validModel ? `${API_ORIGIN}/v1beta/models/${model}:generateContent` : null,
    validModel, modelVerified: false,
  };
}

function readiness(env = process.env) {
  const config = getConfig(env);
  const error = !config.hasApiKey
    ? {code:'missing_api_key', message:'Configure GEMINI_API_KEY securely for the Gemini API.'}
    : !config.validModel ? {code:'missing_model', message:'Set GEMINI_MODEL to an accessible Gemini model ID.'} : null;
  return {...config, ready:!error, error};
}

function apiError(status, message, env, extra = {}) {
  return {
    status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 502,
    ...extra,
    exactApiError: {source:'gemini_api', message:redact(message, env)},
  };
}

function pythonExecutable(env) {
  if (env.ARGON_PYTHON) return env.ARGON_PYTHON;
  if (env.ARGON_VENV_DIR) return path.join(env.ARGON_VENV_DIR, 'bin', 'python');
  if (fs.existsSync('/workspace/argon-venv/bin/python')) return '/workspace/argon-venv/bin/python';
  return 'python3';
}

// Python's standard HTTPS opener honors HTTPS_PROXY and verifies TLS on Node18+.
// The key is inherited through the environment, never put in argv, stdin, or a URL.
function pythonTransport(request, {env = process.env} = {}) {
  return new Promise((resolve,reject) => {
    const child = spawn(pythonExecutable(env), [BRIDGE], {env, stdio:['pipe','pipe','pipe']});
    const chunks = [];
    let bytes = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('Gemini request timed out. No automatic retry was submitted.'));
    }, request.timeoutMs + 5000);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) {
        child.kill('SIGTERM'); finish(new Error('Gemini response exceeded the size limit.'));
      } else chunks.push(chunk);
    });
    // Never forward transport stderr: it may contain user or service diagnostics.
    child.stderr.on('data', () => {});
    child.on('error', () => finish(new Error('Gemini HTTPS transport is unavailable. Check the cloud Python interpreter.')));
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish(new Error('Gemini HTTPS transport failed. No automatic retry was submitted.'));
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { finish(new Error('Gemini HTTPS transport returned an invalid response.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

function thinkingConfig(model, level) {
  const normalized = String(level || 'MEDIUM').toUpperCase();
  if (!['MINIMAL','LOW','MEDIUM','HIGH'].includes(normalized)) throw new Error('Unsupported Gemini thinking level.');
  if (/^gemini-2\.5/i.test(model)) {
    const budget = {MINIMAL:128, LOW:1024, MEDIUM:4096, HIGH:8192}[normalized];
    return {thinkingBudget:budget};
  }
  if (/^gemini-(?:[3-9]|[1-9][0-9])(?:[.-]|$)/i.test(model)) return {thinkingLevel:normalized};
  return undefined;
}

function normalizeUsage(usage = {}) {
  return {promptTokens:usage.promptTokenCount || 0, thoughtsTokens:usage.thoughtsTokenCount || 0,
    outputTokens:usage.candidatesTokenCount || 0, totalTokens:usage.totalTokenCount || 0};
}

function createClient({env = process.env, transport = pythonTransport, now = Date.now} = {}) {
  async function request(operation, payload, pageToken) {
    const state = readiness(env);
    if (!state.hasApiKey || (operation !== 'listModels' && !state.validModel)) throw apiError(503, state.error.message, env, {code:state.error.code});
    const requestedTimeout = Number(env.GEMINI_TIMEOUT_MS || 120000);
    const timeoutMs = Number.isFinite(requestedTimeout) ? Math.max(1000, Math.min(240000, requestedTimeout)) : 120000;
    const query = operation === 'listModels' ? `?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}` : '';
    const endpointUrl = operation === 'listModels' ? `${API_ORIGIN}/v1beta/models${query}` : state.endpointUrl;
    let response;
    try { response = await transport({operation, model:state.model, endpointUrl, payload, timeoutMs, pageToken}, {env}); }
    catch (error) { throw apiError(502, error?.message || 'Gemini HTTPS request failed.', env, {endpointUrl}); }
    const body = response?.body;
    if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300 || body?.error) {
      const message = body?.error?.message || response?.message || `Gemini API returned HTTP ${response?.status || 'unknown'}.`;
      throw apiError(response?.status, message, env, {endpointUrl});
    }
    if (!body || typeof body !== 'object') throw apiError(502,'Gemini API returned a non-JSON response.',env,{endpointUrl});
    return {body, endpointUrl};
  }
  return {
    getConfig:() => getConfig(env), readiness:() => readiness(env),
    async generateJSON({parts, systemInstruction, thinkingLevel = 'MEDIUM', temperature = 0.2}) {
      const started = now();
      const state = readiness(env);
      if (!state.ready) throw apiError(503,state.error.message,env,{code:state.error.code});
      const generationConfig = {responseMimeType:'application/json',temperature};
      try {
        const thinking = thinkingConfig(state.model,thinkingLevel);
        if (thinking) generationConfig.thinkingConfig = thinking;
      } catch(error) { throw apiError(400,error.message,env); }
      const payload = {contents:[{role:'user',parts}],generationConfig};
      if (systemInstruction) payload.systemInstruction = {parts:[{text:systemInstruction}]};
      const {body,endpointUrl} = await request('generateContent',payload);
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') throw apiError(502,'Gemini output was truncated (MAX_TOKENS).',env,{endpointUrl});
      const output = (candidate?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
      if (!output) throw apiError(502,'Gemini returned no usable model text; the response may have been blocked.',env,{endpointUrl});
      let data;
      try { data = JSON.parse(output.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim()); }
      catch (_) { throw apiError(502,'Gemini returned invalid structured JSON. No partial scene was accepted.',env,{endpointUrl}); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw apiError(502,'Gemini structured output must be a JSON object.',env,{endpointUrl});
      return {data,latencyMs:now()-started,usage:normalizeUsage(body.usageMetadata),modelVersion:redact(body.modelVersion || state.model,env)};
    },
    async listModels() {
      const models = [];
      let pageToken;
      for(let page=0;page<10;page++) {
        const {body} = await request('listModels',undefined,pageToken);
        for (const model of body.models || []) models.push({name:redact(model.name,env),displayName:redact(model.displayName,env),
          supportedGenerationMethods:(model.supportedGenerationMethods || []).map(value => redact(value,env))});
        if (!body.nextPageToken) return models;
        pageToken = body.nextPageToken;
      }
      throw apiError(502,'Gemini model list exceeded the pagination limit.',env);
    },
  };
}
const client = createClient();
module.exports = {getConfig,readiness,createClient,generateJSON:client.generateJSON,listModels:client.listModels};
