const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {getConfig,readiness,createClient}=require('../gemini-client');
const KEY='fixture-private-gemini-key';
const configured={GEMINI_API_KEY:KEY,GEMINI_MODEL:'gemini-4-argon'};
const success={status:200,body:{candidates:[{finishReason:'STOP',content:{parts:[
 {thought:true,text:'private thinking is not scene JSON'},
 {text:'```json\n{"bpyCode":'}, {text:'"cube source"}\n```'}]}}],
 usageMetadata:{promptTokenCount:10,thoughtsTokenCount:4,candidatesTokenCount:9,totalTokenCount:23},modelVersion:'gemini-fixture-version'}};

test('readiness is nonsecret, keeps explicit model configuration, and does not call gcloud',async()=>{
 const config=getConfig(configured);
 assert.equal(config.provider,'gemini');assert.equal(config.hasApiKey,true);assert.equal(config.modelVerified,false);
 assert.equal(config.endpointUrl,'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent');
 assert.ok(!JSON.stringify(config).includes(KEY));
 assert.equal(readiness({}).error.code,'missing_api_key');
 assert.equal(readiness({...configured,GEMINI_MODEL:''}).error.code,'missing_model');
 assert.equal(getConfig({...configured,GEMINI_MODEL:'../models?key='+KEY}).endpointUrl,null);
 assert.ok(!JSON.stringify(getConfig({...configured,GEMINI_MODEL:KEY})).includes(KEY));
 let calls=0;
 const client=createClient({env:{},transport:async()=>{calls++;return success;}});
 await assert.rejects(client.generateJSON({parts:[]}),error=>error.status===503 && error.exactApiError.source==='gemini_api');
 assert.equal(calls,0);
});

test('generation sends all images/text and JSON options, joins non-thought output, and preserves usage',async()=>{
 let request, privateOptions;
 const client=createClient({env:configured,transport:async(a,b)=>{request=a;privateOptions=b;return success;},now:(()=>{let time=100;return()=>time+=20;})()});
 const parts=[{text:'Author this photograph'},{inlineData:{mimeType:'image/jpeg',data:'fixture'}}];
 const result=await client.generateJSON({parts,systemInstruction:'Write Blender geometry',thinkingLevel:'HIGH',temperature:.3});
 assert.deepEqual(request.payload.contents,[{role:'user',parts}]);
 assert.deepEqual(request.payload.systemInstruction,{parts:[{text:'Write Blender geometry'}]});
 assert.deepEqual(request.payload.generationConfig,{responseMimeType:'application/json',temperature:.3,thinkingConfig:{thinkingLevel:'HIGH'}});
 assert.equal(request.operation,'generateContent');assert.ok(!JSON.stringify(request).includes(KEY));
 assert.equal(privateOptions.env.GEMINI_API_KEY,KEY);
 assert.deepEqual(result.data,{bpyCode:'cube source'});assert.equal(result.latencyMs,20);
 assert.deepEqual(result.usage,{promptTokens:10,thoughtsTokens:4,outputTokens:9,totalTokens:23});
 assert.equal(result.modelVersion,'gemini-fixture-version');
});

test('2.5 models use thinkingBudget while older models omit unsupported thinking configuration',async()=>{
 for(const [model,expected] of [['gemini-2.5-pro',{thinkingBudget:4096}],['gemini-2.0-flash',undefined]]) {
  let request;
  const client=createClient({env:{...configured,GEMINI_MODEL:model},transport:async value=>{request=value;return success;}});
  await client.generateJSON({parts:[]});
  assert.deepEqual(request.payload.generationConfig.thinkingConfig,expected);
 }
});

test('API and transport errors are redacted and never retried or switched to another provider',async()=>{
 let calls=0;
 const client=createClient({env:configured,transport:async()=>{calls++;return {status:403,body:{error:{message:`API key ${KEY} is not allowed; x-goog-api-key=${KEY}`}}};}});
 await assert.rejects(client.generateJSON({parts:[]}),error=>{
  assert.equal(error.status,403);assert.equal(error.exactApiError.source,'gemini_api');
  assert.ok(!JSON.stringify(error).includes(KEY));assert.match(error.exactApiError.message,/REDACTED/);return true;
 });
 assert.equal(calls,1);
 const broken=createClient({env:configured,transport:async()=>{throw new Error('Connection rejected for '+KEY);}});
 await assert.rejects(broken.generateJSON({parts:[]}),error=>error.status===502 && !JSON.stringify(error).includes(KEY));
});

test('empty, truncated and invalid model responses never become partial scene results',async()=>{
 for(const body of [{candidates:[]},{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"bpyCode":'}]}}]},
  {candidates:[{content:{parts:[{text:'not JSON'}]}}]},{candidates:[{content:{parts:[{text:'[]'}]}}]}]) {
  const client=createClient({env:configured,transport:async()=>({status:200,body})});
  await assert.rejects(client.generateJSON({parts:[]}),error=>error.status===502 && error.exactApiError.source==='gemini_api');
 }
});

test('model listing uses a header-authenticated operation and returns only metadata across pages',async()=>{
 const calls=[];
 const client=createClient({env:{...configured,GEMINI_MODEL:''},transport:async request=>{
  calls.push(request); return {status:200,body:calls.length===1
   ? {models:[{name:'models/gemini-one',displayName:'One',supportedGenerationMethods:['generateContent'],extra:'not forwarded'}],nextPageToken:'page-two'}
   : {models:[{name:'models/gemini-two',supportedGenerationMethods:['countTokens']}]}};
 }});
 const models=await client.listModels();
 assert.equal(models.length,2);assert.equal(models[0].extra,undefined);
 assert.equal(calls[0].operation,'listModels');assert.equal(calls[1].pageToken,'page-two');
 assert.ok(calls.every(request=>!request.endpointUrl.includes(KEY) && !request.endpointUrl.includes('key=')));
});

test('private Python bridge puts key in header only, honors proxy/TLS opener, and refuses redirects',()=>{
 const script=path.join(__dirname,'..','scripts','gemini-request.py');
 const fixture=String.raw`
import importlib.util, io, json, os, sys, urllib.error
spec=importlib.util.spec_from_file_location('bridge',sys.argv[1]); bridge=importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
key='fixture-private-gemini-key'
requests=[]
class Response:
 status=200
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def read(self,n): return b'{"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":true}"}]}}]}'
class Opener:
 def open(self,request,timeout):
  requests.append(request)
  assert request.get_header('X-goog-api-key')==key
  assert key not in request.full_url and 'key=' not in request.full_url
  assert request.full_url.startswith('https://generativelanguage.googleapis.com/')
  assert timeout==120
  return Response()
def build(*handlers):
 assert len(handlers)==1 and isinstance(handlers[0],bridge.NoRedirect)
 return Opener()
bridge.urllib.request.build_opener=build
result=bridge.perform({'operation':'generateContent','model':'gemini-4-argon','payload':{'contents':[]}},key)
assert result['status']==200
assert requests[0].method=='POST'
bridge.perform({'operation':'listModels','model':'','pageToken':'next-page'},key)
assert requests[-1].method=='GET' and 'pageToken=next-page' in requests[-1].full_url
assert bridge.NoRedirect().redirect_request(None,None,302,'redirect',{},'https://untrusted.example') is None
class Failed:
 def open(self,request,timeout):
  raise urllib.error.HTTPError(request.full_url,403,'Forbidden',{},io.BytesIO(json.dumps({'error':{'message':'bad key '+key}}).encode()))
bridge.urllib.request.build_opener=lambda *args: Failed()
failed=bridge.perform({'operation':'listModels','model':''},key)
assert failed['status']==403 and key not in json.dumps(failed)
print('Bridge contract passed; no external requests made')
`;
 const result=spawnSync('python3',['-c',fixture,script],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr || result.stdout);
 assert.match(result.stdout,/Bridge contract passed/);assert.ok(!result.stdout.includes(KEY));
});


test('a key accidentally pasted as the model never appears in a URL or public metadata',()=>{
 const key='AIza'+'a'.repeat(35);
 const config=getConfig({GEMINI_MODEL:key,GEMINI_API_KEY:key});
 assert.equal(config.validModel,false);assert.equal(config.endpointUrl,null);
 assert.equal(JSON.stringify(config).includes(key),false);
});
