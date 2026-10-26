// Uses only the secure server environment binding; never prints the key.
const {getConfig,listModels,generateJSON}=require('../gemini-client');
(async()=>{
 const config=getConfig();
 if(!config.hasApiKey) throw new Error('Configure GEMINI_API_KEY securely for the Gemini API.');
 const models=await listModels();
 const supported=models.filter(model=>model.supportedGenerationMethods.includes('generateContent'));
 const selected=supported.find(model=>model.name.replace(/^models\//,'')===config.model);
 console.log(JSON.stringify({provider:'gemini',configuredModel:config.model,configuredModelListed:Boolean(selected),models:supported}));
 if(!process.argv.includes('--generate'))return;
 if(!selected)throw new Error('The configured GEMINI_MODEL is not listed for this key. Select an accessible model explicitly; no automatic fallback was made.');
 const result=await generateJSON({parts:[{text:'Return exactly one JSON object with ready set to true.'}],thinkingLevel:'LOW',temperature:0});
 if(result.data.ready!==true)throw new Error('Gemini returned a JSON object that did not satisfy the readiness check.');
 console.log(JSON.stringify({ok:true,provider:'gemini',model:config.model,modelVersion:result.modelVersion,latencyMs:result.latencyMs,usage:result.usage}));
})().catch(error=>{console.error(error.exactApiError?.message||error.message||'Gemini verification failed');process.exitCode=1;});
