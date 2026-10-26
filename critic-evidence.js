const { inlineImage } = require('./gemini-inputs');

const REQUIRED_VIEWS = ['originalCam', 'threeQuarter', 'lowAngle', 'wireframe'];
const VISUAL_THRESHOLD = 9;

function validateCriticImages(body) {
  if (!body.originalImageDataUrl) {
    throw Object.assign(new Error('A reference image is required for rendered critique.'), {status:400});
  }
  inlineImage(body.originalImageDataUrl);
  for (const name of REQUIRED_VIEWS) {
    if (!body.fourViews?.[name]) {
      throw Object.assign(new Error(`Missing diagnostic render: ${name}. No critique was submitted.`), {status:400});
    }
    inlineImage(body.fourViews[name], 'image/png');
  }
  if (body.fourViews.clockDetail) inlineImage(body.fourViews.clockDetail, 'image/png');
}

// This validates the recorded model decision. It cannot authenticate the image
// provenance or replace a human/independent inspection of the actual GLB renders.
function assessCritique(critique) {
  const rating = critique?.overallRatingOutOf10;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw Object.assign(new Error('The visual critic returned an invalid rating; no acceptance was recorded.'), {status:502});
  }
  const reasons = [];
  if (rating < VISUAL_THRESHOLD) reasons.push(`Rendered critique is below ${VISUAL_THRESHOLD}/10.`);
  if (critique.passedThreshold !== true) reasons.push('The visual critic did not explicitly accept this draft.');
  if (!Array.isArray(critique.deficiencies)) reasons.push('The visual critic omitted its deficiency assessment.');
  else {
    if (critique.deficiencies.some(item => !/^(critical|high|blocker|release[ _-]?blocking|medium|low)$/i.test(String(item?.severity).trim()))) {
      reasons.push('The visual critic returned deficiencies without a valid severity assessment.');
    }
    if (critique.deficiencies.some(item => /^(critical|high|blocker|release[ _-]?blocking)$/i.test(String(item?.severity).trim()))) {
      reasons.push('The visual critic reports unresolved blocking deficiencies.');
    }
  }
  return {...critique, passedThreshold:reasons.length === 0,
    acceptance:{thresholdOutOf10:VISUAL_THRESHOLD, accepted:reasons.length === 0, reasons,
      scope:'Recorded rendered-view critic decision; artifact provenance and visual review are separate requirements.'}};
}

module.exports = {validateCriticImages, assessCritique, VISUAL_THRESHOLD};
