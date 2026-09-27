import {useId} from 'react';
import {ChevronDown} from 'lucide-react';
import {SUPPORTED_MODELS} from '../lib/model-policy.mjs';
import './model-chooser.css';
export default function ModelChooser({value,onChange}){
 const id=useId();
 return <div className="model-block model-chooser">
  <label htmlFor={id}>图像模型</label>
  <div className="model-chooser-control">
   <select id={id} value={value} onChange={event=>onChange(event.target.value)}>
    {SUPPORTED_MODELS.map(model=><option key={model.id} value={model.id}>{model.name.replace(/^NovelAI Diffusion\s+/,'')}</option>)}
   </select>
   <ChevronDown size={15} aria-hidden="true"/>
  </div>
 </div>;
}
