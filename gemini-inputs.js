const crypto = require('node:crypto');
function inlineImage(source, fallbackMime = 'image/jpeg') {
  const value=String(source || '');
  const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i);
  const mimeType=match?match[1].toLowerCase():fallbackMime;
  const data=match?match[2]:value;
  if (!['image/jpeg','image/png','image/webp'].includes(mimeType) || !data || /^data:/i.test(data) || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw Object.assign(new Error('Gemini image input must be a base64 JPEG, PNG, or WebP.'),{status:400});
  }
  return {inlineData:{mimeType,data}};
}
function responseCacheKey(prefix, input, model) {
  const digest=crypto.createHash('sha256').update(JSON.stringify({provider:'gemini',model,input})).digest('hex').slice(0,24);
  return `${prefix}_${digest}.json`;
}
module.exports={inlineImage,responseCacheKey};
