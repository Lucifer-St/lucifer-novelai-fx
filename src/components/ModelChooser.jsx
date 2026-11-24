import {useId} from 'react';
import {ChevronDown} from 'lucide-react';
import {DEFAULT_MODEL,CURATED_V5,SUPPORTED_MODELS} from '../lib/model-policy.mjs';
import './model-chooser.css';
const models=[...SUPPORTED_MODELS].sort((a,b)=>Number(b.v5)-Number(a.v5));
export default function ModelChooser({value,onChange,effort,onEffort,mode}){
 const id=useId();
 return <>
 <div className="model-block model-chooser">
  <label htmlFor={id}>图像模型</label>
  <div className="model-chooser-control">
   <select id={id} value={value} onChange={event=>onChange(event.target.value)}>
    {models.map(model=><option key={model.id} value={model.id}>{model.name.replace(/^NovelAI Diffusion\s+/,'')}</option>)}
   </select>
   <ChevronDown size={15} aria-hidden="true"/>
  </div>
 </div>
 {value===DEFAULT_MODEL&&<div className="model-effort">
  <div className="model-effort-toggle" role="group" aria-label="Effort">
   <span>Effort</span>
   {['medium','high'].map(option=><button key={option} type="button"
    aria-pressed={(effort??'high')===option}
    onClick={()=>onEffort(option)}>{option==='medium'?'Medium':'High'}</button>)}
  </div>
  {effort==='medium'&&<small>固定 14 步 · Euler Ancestral · Heavy 负面预设</small>}
 </div>}
 {value===CURATED_V5&&mode==='infill'&&<p className="model-effort">局部重绘使用 V4.5 Curated。</p>}
 </>;
}
