import {changeGenerationMode,cleanComparisonMode} from '../lib/generation-mode.mjs';
import {useEffect,useMemo,useRef,useState} from 'react';
import {comparisonDefaults,variantState,COMPARISON_FIELDS,planComparison} from '../lib/comparison.mjs';
import {api} from '../lib/api.mjs';
import {recoverParameterState} from '../lib/parameter-policy.mjs';
import {buildRequest,validateRequest,stateFromPayload} from '../lib/request.mjs';
import {resizeSource} from '../lib/image.mjs';
import {isAndroid} from '../lib/platform.mjs';

export function useComparisons(base,setBase,{onResult,onError}){
 const [config,setConfig]=useState(()=>{try{return cleanComparisonMode(comparisonDefaults(JSON.parse(localStorage.getItem('lucifer-comparisons-v1')||'{}')),base.mode);}catch{return comparisonDefaults();}}),[variant,setVariant]=useState('A'),[record,setRecord]=useState(null),[records,setRecords]=useState([]),[busy,setBusy]=useState(false),[submitting,setSubmitting]=useState(false);
 const enabledRef=useRef(config.enabled),activeRef=useRef(null),delivered=useRef(new Set()),callbacks=useRef({onResult,onError});callbacks.current={onResult,onError};enabledRef.current=config.enabled;
 const effective=useMemo(()=>config.enabled?variantState(base,config,variant):base,[base,config,variant]);
 useEffect(()=>{try{localStorage.setItem('lucifer-comparisons-v1',JSON.stringify({...config,enabled:false}));}catch{}},[config]);
 useEffect(()=>{if(!busy||!activeRef.current)return;let alive=true;const refresh=async()=>{try{const r=await api(`/api/comparisons/${activeRef.current}`);if(!alive)return;setRecord(r);setRecords(items=>[r,...items.filter(x=>x.id!==r.id)].slice(0,20));for(const j of r.jobs)if(j.result&&!delivered.current.has(j.result.id)){delivered.current.add(j.result.id);callbacks.current.onResult?.(j.result);}if(!['queued','running','stopping'].includes(r.status)){setBusy(false);activeRef.current=null;}}catch(e){if(alive)callbacks.current.onError(e.message);}};refresh();const timer=setInterval(refresh,900);return()=>{alive=false;clearInterval(timer);};},[busy]);
 useEffect(()=>{if(isAndroid())return;const close=()=>{if(activeRef.current)navigator.sendBeacon(`/api/comparisons/${activeRef.current}/stop`,new Blob(['{}'],{type:'application/json'}));};window.addEventListener('pagehide',close);return()=>window.removeEventListener('pagehide',close);},[]);
 const setEffective=change=>{
  const next=typeof change==='function'?change(effective):change;
  const modeChanged=next.mode!==effective.mode;
  if(modeChanged)setConfig(c=>cleanComparisonMode(c,next.mode));
  if(!config.enabled||variant==='A'){setBase(next);return;}
  const shared=Object.fromEntries(Object.entries(next).filter(([k,v])=>!COMPARISON_FIELDS.includes(k)&&JSON.stringify(v)!==JSON.stringify(effective[k])));
  const nextBase=modeChanged?changeGenerationMode({...base,...shared},next.mode):{...base,...shared};
  if(Object.keys(shared).length)setBase(s=>modeChanged?changeGenerationMode({...s,...shared},next.mode):({...s,...shared}));
  const overrides={...config.overrides[variant]};for(const key of COMPARISON_FIELDS)if(JSON.stringify(next[key])!==JSON.stringify(effective[key])){if(JSON.stringify(next[key])===JSON.stringify(nextBase[key]))delete overrides[key];else overrides[key]=next[key];}
  setConfig(c=>({...c,overrides:{...c.overrides,[variant]:overrides}}));
 };
 async function stop(){enabledRef.current=false;if(activeRef.current){try{setRecord(await api(`/api/comparisons/${activeRef.current}/stop`,{method:'POST',body:{}}));}catch(e){onError(e.message);}}}
 async function enable(value){setConfig(c=>({...c,enabled:value,rounds:value?c.rounds:1}));if(!value){setVariant('A');if(busy)await stop();}else{try{const d=await api('/api/comparisons');setRecords(d.entries);if(d.active){activeRef.current=d.active.id;setBusy(true);}}catch(e){onError(e.message);}}}
 async function run(){if(busy||submitting||!config.enabled)return;setSubmitting(true);const snapshot=structuredClone(recoverParameterState(base).state),settings=structuredClone(config);
  try{const payload=buildRequest({...snapshot,seed:snapshot.seed<0?0:snapshot.seed});validateRequest(snapshot,payload);const p=payload.novelai.body.parameters;
   if(snapshot.mode!=='generate'&&snapshot.source){snapshot.source=(await resizeSource(snapshot.source,p.width,p.height)).dataURL;if(snapshot.mode==='infill'&&snapshot.mask)snapshot.mask=(await resizeSource(snapshot.mask,p.width,p.height)).dataURL;}
   const plan=planComparison(snapshot,settings);
   if(!enabledRef.current)return;
   const r=await api('/api/comparisons',{method:'POST',body:{state:snapshot,config:settings,plan}});activeRef.current=r.id;setRecord(r);setBusy(true);
   if(!enabledRef.current)await stop();
  }catch(e){onError(e.message);}finally{setSubmitting(false);}
 }
 async function load(id){try{setRecord(await api(`/api/comparisons/${id}`));}catch(e){onError(e.message);}}
 async function adopt(job){try{const full=await api(`/api/comparisons/${record.id}?full=1`),original=full.jobs.find(j=>j.round===job.round&&j.variant===job.variant);if(!original)return;setBase(stateFromPayload(original.payload));setConfig(c=>({...c,enabled:false}));setVariant('A');}catch(e){onError(e.message);}}
 function createB(state){const overrides=Object.fromEntries(COMPARISON_FIELDS.filter(k=>JSON.stringify(state[k])!==JSON.stringify(base[k])).map(k=>[k,state[k]]));setConfig(c=>({...c,enabled:true,mode:'AB',overrides:{...c.overrides,B:overrides}}));setVariant('B');}
 return {config,setConfig,variant,setVariant,effective,setEffective,enable,run,stop,load,adopt,createB,record,records,busy:busy||submitting,disarm:()=>{setConfig(c=>({...c,enabled:false,rounds:1}));setVariant('A');if(busy)stop();}};
}
