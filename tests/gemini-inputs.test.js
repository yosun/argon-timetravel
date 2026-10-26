const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inlineImage,responseCacheKey}=require('../gemini-inputs');
test('Gemini receives the original JPEG, PNG and WebP MIME and exact bytes',()=>{
 for(const type of ['image/jpeg','image/png','image/webp']) assert.deepEqual(inlineImage(`data:${type};base64,aW1hZ2U=`),{inlineData:{mimeType:type,data:'aW1hZ2U='}});
 assert.equal(inlineImage('aW1hZ2U=','image/png').inlineData.mimeType,'image/png');
 assert.throws(()=>inlineImage('data:image/svg+xml;base64,aW1hZ2U='));
 assert.throws(()=>inlineImage(''));
});
test('cached model results stay isolated by full image, model, calibration and rendered views',()=>{
 const image1='a'.repeat(500)+'b',image2='a'.repeat(500)+'c';
 const base={image:image1,metrics:{fov:60},views:{original:'first'}};
 const key=responseCacheKey('author',base,'gemini-one');
 assert.equal(key,responseCacheKey('author',structuredClone(base),'gemini-one'));
 assert.notEqual(key,responseCacheKey('author',{...base,image:image2},'gemini-one'));
 assert.notEqual(key,responseCacheKey('author',base,'gemini-two'));
 assert.notEqual(key,responseCacheKey('author',{...base,metrics:{fov:90}},'gemini-one'));
 assert.notEqual(key,responseCacheKey('author',{...base,views:{original:'second'}},'gemini-one'));
});
