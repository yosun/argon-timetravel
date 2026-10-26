const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateCriticImages,assessCritique} = require('../critic-evidence');

test('critique requires all four diagnostic images before an API call can be made', () => {
  const image = 'data:image/png;base64,aW1hZ2U=';
  const body = {originalImageDataUrl:image,fourViews:Object.fromEntries(
    ['originalCam','threeQuarter','lowAngle','wireframe'].map(view => [view,image]))};
  validateCriticImages(body);
  for (const view of Object.keys(body.fourViews)) {
    const incomplete = {...body,fourViews:{...body.fourViews,[view]:''}};
    assert.throws(() => validateCriticImages(incomplete), error => error.status === 400 && error.message.includes(view));
  }
  assert.throws(() => validateCriticImages({...body,originalImageDataUrl:''}),error => error.status === 400);
  assert.throws(() => validateCriticImages({...body,fourViews:{...body.fourViews,clockDetail:'data:image/svg+xml;base64,PHN2Zz4='}}));
});

test('a model boolean or geometry telemetry cannot promote an inadequate rendered score', () => {
  const draft = {overallRatingOutOf10:4.8,passedThreshold:true,deficiencies:[],totalTriangles:1000000};
  assert.equal(assessCritique(draft).passedThreshold,false);
  assert.equal(draft.passedThreshold,true,'Do not mutate original critic records');
  assert.equal(assessCritique({...draft,overallRatingOutOf10:8.99}).passedThreshold,false);
  assert.equal(assessCritique({...draft,overallRatingOutOf10:9,passedThreshold:false}).passedThreshold,false);
  for (const severity of ['high','critical','blocker','release-blocking','Release Blocking']) {
    assert.equal(assessCritique({...draft,overallRatingOutOf10:9.5,deficiencies:[{severity}]}).passedThreshold,false);
  }
  assert.equal(assessCritique({...draft,overallRatingOutOf10:9.5,deficiencies:undefined}).passedThreshold,false);
  assert.equal(assessCritique({...draft,overallRatingOutOf10:9.5,deficiencies:[{}]}).passedThreshold,false);
  const accepted = assessCritique({...draft,overallRatingOutOf10:9,deficiencies:[]});
  assert.equal(accepted.passedThreshold,true);
  assert.equal(accepted.acceptance.thresholdOutOf10,9);
  for(const rating of [undefined,'9',NaN,11,-1]) {
    assert.throws(() => assessCritique({...draft,overallRatingOutOf10:rating}),error => error.status === 502);
  }
});
