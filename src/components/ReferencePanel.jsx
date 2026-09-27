import {useRef,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import ImageInput from './ImageInput';
import {Select,Slider,Toggle} from './Fields';
import {preparePreciseReference} from '../lib/image.mjs';
import {isV45,isReferenceParameter} from '../lib/model-policy.mjs';
import {api} from '../lib/api.mjs';
import './reference-panel.css';

export function changeReferenceMode(state,mode){
 let extraJSON=state.extraJSON;
 try{extraJSON=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(extraJSON||'{}')).filter(([key])=>!isReferenceParameter(key))),null,2);}catch{/* Preserve invalid manual JSON. */}
 return {...state,referenceMode:mode,extraJSON,overrides:Object.fromEntries(Object.entries(state.overrides||{}).filter(([key])=>!isReferenceParameter(key)))};
}
export default function ReferencePanel({state:s,setState}){
 const [error,setError]=useState(''),[working,setWorking]=useState('');
 const sequence=useRef(new Map());
 if(!isV45(s.model))return null;
 const mode=s.referenceMode||'off',field=mode==='precise'?'precise':'vibes',refs=s[field]||[];
 const update=(id,patch)=>setState(old=>({...old,[field]:(old[field]||[]).map(ref=>ref.id===id?{...ref,...patch}:ref)}));
 async function imageChanged(ref,image){
  const token=crypto.randomUUID();sequence.current.set(ref.id,token);setError('');
  if(!image){update(ref.id,{image:'',originalImage:'',encoding:'',encodingRequestId:null});return;}
  setWorking(ref.id);
  try{
   const prepared=mode==='precise'?await preparePreciseReference(image):{dataURL:image};
   if(sequence.current.get(ref.id)===token)update(ref.id,{image:prepared.dataURL,originalImage:image,encoding:'',encodingRequestId:null});
  }catch(e){setError(e.message);}finally{setWorking('');}
 }
 async function encode(ref){
  const requestId=ref.encodingRequestId||crypto.randomUUID(),model=s.model,information=Number(ref.information??1);
  update(ref.id,{encodingRequestId:requestId});setWorking(ref.id);setError('');
  try{
   const result=await api('/api/reference/encode',{method:'POST',body:{model,image:ref.image,information,requestId}});
   if(result.status!=='completed')throw Error('编码结果尚不明确，可能已扣费；保留原任务 ID，请再次查询同一任务，不要重新上传重复编码。');
   setState(old=>({...old,vibes:(old.vibes||[]).map(item=>item.id===ref.id&&item.image===ref.image&&Number(item.information??1)===information?{...item,encoding:result.encoding,encodedModel:model,encodedInformation:information}:item)}));
  }catch(e){setError(e.message);}finally{setWorking('');}
 }
 return <section className="reference-panel" aria-label="V4.5 参考图">
  <h3>参考图 · V4.5</h3>
  <div className="segment reference-tabs" role="group" aria-label="参考图模式">{[['off','关闭'],['precise','Precise Reference'],['vibe','Vibe Transfer']].map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} className={mode===value?'selected':''} onClick={()=>{setError('');setState(old=>changeReferenceMode(old,value));}}>{label}</button>)}</div>
  {mode==='off'?<p className="hint">参考图已关闭。已添加的图片保留在本机，可随时重新启用。</p>:<>
   <p className="hint">{mode==='precise'?'每张参考图每次生成另计 5 Anlas；多个角色参考会混合特征。':'编码通常另计 2 Anlas；修改信息量或模型需要重新编码。超过 4 张参考图还有附加费。'} 与{mode==='precise'?' Vibe Transfer':' Precise Reference'}互斥；网关实际费用以其账单为准。</p>
   {refs.map((ref,i)=><div className="reference-card" key={ref.id}>
    <div className="section-label"><strong>参考图 {i+1}</strong><button type="button" aria-label={`删除参考图 ${i+1}`} onClick={()=>{sequence.current.set(ref.id,'removed');setState(old=>({...old,[field]:(old[field]||[]).filter(item=>item.id!==ref.id)}));}}><Trash2 size={15}/></button></div>
    <ImageInput label={`${mode==='precise'?'Precise':'Vibe'} 参考图 ${i+1}`} value={ref.originalImage||ref.image} onChange={image=>imageChanged(ref,image)} help={mode==='precise'?'本机准备黑色留边副本；上传不会开启图生图，也不会提交生成。':'图片只在点击编码时发送；编码和生成是两个独立操作。'}/>
    {mode==='precise'?<>
     <Select label={`参考图 ${i+1} 类型`} value={ref.type||'character'} options={[{value:'character',label:'角色'},{value:'style',label:'风格'},{value:'character&style',label:'角色与风格'}]} onChange={type=>update(ref.id,{type})}/>
     <Slider label={`参考图 ${i+1} Strength`} value={ref.strength??1} min={-1} max={1} onChange={strength=>update(ref.id,{strength})}/>
     <Slider label={`参考图 ${i+1} Fidelity`} value={ref.fidelity??1} min={-1} max={1} onChange={fidelity=>update(ref.id,{fidelity})}/>
    </>:<>
     <Slider label={`参考图 ${i+1} 信息量`} value={ref.information??1} onChange={information=>update(ref.id,{information,encodingRequestId:null})}/>
     <Slider label={`参考图 ${i+1} 强度`} value={ref.strength??.6} onChange={strength=>update(ref.id,{strength})}/>
     {ref.encoding&&ref.encodedModel===s.model&&ref.encodedInformation===Number(ref.information??1)?<small>已编码 · 本次无需重新编码</small>:<button type="button" className="wide" disabled={!ref.image||!!working} onClick={()=>encode(ref)}>{working===ref.id?'处理中…':ref.encodingRequestId?'查询原编码任务':'编码此图 · 通常 2 Anlas'}</button>}
    </>}
   </div>)}
   <button type="button" className="wide" disabled={refs.length>=16||!!working} onClick={()=>setState(old=>({...old,[field]:[...(old[field]||[]),{id:crypto.randomUUID(),image:'',type:'character',strength:mode==='precise'?1:.6,fidelity:1,information:1}]}))}><Plus size={14}/>添加参考图</button>
   {mode==='vibe'&&<Toggle label="归一化 Vibe 强度" checked={s.normalize} onChange={normalize=>setState(old=>({...old,normalize}))}/>}
  </>}
  {error&&<p role="alert" className="field-error">{error}</p>}
 </section>;
}
