import fs from 'node:fs/promises';import {aiConfig,systemPrompt} from '../server/dev.mjs';import {validateIntent} from '../js/needs.js';
const config=await aiConfig();if(!config.key)throw new Error('Yerel sunucu anahtarı eksik');
const base=config.baseURL.replace(/\/$/,''),headers={Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'};
const modelsResponse=await fetch(base+'/models',{headers,signal:AbortSignal.timeout(15000)});if(!modelsResponse.ok)throw new Error('Hesap model listesi HTTP '+modelsResponse.status);const catalog=(await modelsResponse.json()).data||[];
const cases=[
 ['Eve giderken motorin ve Migros.',{needs:['fuel','migros'],destination:'home',fuel:'diesel'}],
 ['Yolumu en fazla beş dakika uzatan açık bir market bul.',{needs:['market'],maxExtraMinutes:5,openOnly:true}],
 ['Yakındaki nöbetçi eczaneyi durağa eklemek istiyorum.',{needs:['duty']}],
 ['Bu sokağa girmek istemiyorum, daha rahat bir alternatif bul.',{avoidTurn:true}],
 ['Önce mazot alalım sonra Migros ve eve.',{needs:['fuel','migros'],destination:'home',fuel:'diesel'}],
 ['İşe giderken lastikçi bul.',{needs:['tire'],destination:'work'}],
 ['Mola lazım, kahve içeyim.',{needs:['cafe']}],
 ['Bir yere uğrayalım.',{question:true}]
];
const report={checkedAt:new Date().toISOString(),environment:'Sunucu API · gerçek hesap anahtarı · konum/mekan verisi gönderilmedi',models:[]};
for(const id of ['gemini-3.1-flash-lite','gemini-3-flash']){
 const model=catalog.find(m=>m.id===id),rows=[];if(!model){report.models.push({id,accessible:false});continue;}
 for(const [text,expected] of cases){const start=performance.now();try{const r=await fetch(base+'/chat/completions',{method:'POST',headers,signal:AbortSignal.timeout(16000),body:JSON.stringify({model:id,messages:[{role:'system',content:systemPrompt},{role:'user',content:text}],temperature:0,max_tokens:250,response_format:{type:'json_object'}})});if(!r.ok){rows.push({case:text,http:r.status,passed:false,latencyMs:performance.now()-start});continue;}const j=await r.json(),raw=JSON.parse((j.choices?.[0]?.message?.content||'').replace(/^```(?:json)?\s*|\s*```$/g,'')),intent=validateIntent(raw),passed=Object.entries(expected).every(([k,v])=>k==='needs'?v.every(n=>intent.needs.includes(n)):k==='question'?!!intent.question:intent[k]===v);rows.push({case:text,passed,jsonValid:true,intent,latencyMs:Math.round(performance.now()-start),inputTokens:j.usage?.prompt_tokens??null,outputTokens:j.usage?.completion_tokens??null,reportedCost:j.usage?.cost??null});}catch(e){rows.push({case:text,passed:false,jsonValid:false,error:e.name,latencyMs:Math.round(performance.now()-start)});}}
 const latency=rows.map(x=>x.latencyMs).sort((a,b)=>a-b),input=rows.reduce((s,x)=>s+(x.inputTokens||0),0),output=rows.reduce((s,x)=>s+(x.outputTokens||0),0);report.models.push({id,accessible:true,passed:rows.filter(x=>x.passed).length,cases:rows.length,medianMs:latency[Math.floor(latency.length/2)],maxMs:latency.at(-1),inputTokens:input,outputTokens:output,catalogEstimateUSD:model.pricing?input/1e6*Number(model.pricing.input_per_1m_usd)+output/1e6*Number(model.pricing.output_per_1m_usd):null,costNote:'Katalog tahmini; katalog fiyat kaynağı doğrulanmamış. Gerçek tahsilat raporlanmadıysa bilinmiyor.',rows});
}
const passing=report.models.filter(m=>m.accessible&&m.passed===cases.length).sort((a,b)=>a.medianMs-b.medianMs);report.selected=passing[0]?.id||null;
await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/ai-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify({models:report.models.map(({rows,...m})=>m),selected:report.selected},null,2));
if(report.selected){const os=await import('node:os');const filename=os.homedir()+'/.config/yolcu/ai.json';const data=JSON.parse(await fs.readFile(filename,'utf8'));data.model=report.selected;await fs.writeFile(filename,JSON.stringify(data,null,2),{mode:0o600});}
