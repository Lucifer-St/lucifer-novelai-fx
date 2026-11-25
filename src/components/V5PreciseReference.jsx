import {useRef,useState} from 'react';
import {ChevronDown,ScanFace,Trash2} from 'lucide-react';
import {preparePreciseReference} from '../lib/image.mjs';
import {MAX_PRECISE_REFERENCES,supportsPreciseReference} from '../lib/model-policy.mjs';
import {Select,Slider,Toggle} from './Fields';
import ImageInput from './ImageInput';
import './v5-precise.css';

const types=[
  {value:'character',label:'角色'},
  {value:'style',label:'风格'},
  {value:'character&style',label:'角色与风格'},
  {value:'costume',label:'衣装'},
];

export default function V5PreciseReference({state,setState}){
  const refs=state.precise||[];
  const enabled=state.referenceMode==='precise';
  const allowed=supportsPreciseReference(state.model,state.mode);
  const count=refs.filter(ref=>ref.enabled!==false&&ref.image).length;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const preparing=useRef(false);

  async function addImage(image,details){
    if(!image||preparing.current)return;
    preparing.current=true;
    setBusy(true);
    setError('');
    const model=state.model;
    try{
      const prepared=await preparePreciseReference(image,{v5:true});
      const ref={
        id:crypto.randomUUID(),name:details?.name,originalImage:image,image:prepared.dataURL,
        type:'character&style',sameOutfit:true,strength:1,enabled:true,
      };
      setState(old=>old.model===model&&old.precise.length<MAX_PRECISE_REFERENCES
        ? {...old,referenceMode:'precise',precise:[...old.precise,ref]} : old);
    }catch(cause){
      setError(cause.message||'无法准备这张参考图。');
    }finally{
      preparing.current=false;
      setBusy(false);
    }
  }
  const edit=(id,patch)=>setState(old=>({...old,precise:old.precise.map(ref=>ref.id===id?{...ref,...patch}:ref)}));
  const remove=id=>setState(old=>({...old,precise:old.precise.filter(ref=>ref.id!==id)}));
  const status=!allowed?'局部重绘暂停使用':count&&enabled?`${count} 张启用 · 每张生成 +${count*5} Anlas`:refs.length?'已暂停 · 草稿保留':'角色、风格与衣装';

  return <details className="v5-precise" open>
    <summary>
      <span className="v5-precise-icon"><ScanFace size={18} aria-hidden="true"/></span>
      <span><strong>精准参考</strong><small>{status}</small></span>
      <ChevronDown size={16} className="v5-precise-chevron" aria-hidden="true"/>
    </summary>
    <div className="v5-precise-body">
      {!allowed?<p className="hint">V5 局部重绘暂不支持精准参考。切回文生图或图生图即可继续使用。</p>:<>
        {!!refs.length&&<Toggle label="用于本次生成" checked={enabled}
          onChange={checked=>setState(old=>({...old,referenceMode:checked?'precise':'off'}))}/>}
        {refs.map((ref,index)=>{
          const type=ref.type||'character&style';
          const label=`参考图 ${index+1}`;
          return <article className="v5-precise-card" key={ref.id}>
            <header>
              <img src={ref.originalImage||ref.image} alt="" />
              <div><strong>{label}</strong><small title={ref.name}>{ref.name||'已导入图片'}</small></div>
              <label className="v5-precise-enable" title={`启用${label}`}>
                <input type="checkbox" aria-label={`启用${label}`} checked={ref.enabled!==false} onChange={e=>edit(ref.id,{enabled:e.target.checked})}/>
              </label>
              <button type="button" aria-label={`移除${label}`} onClick={()=>remove(ref.id)}><Trash2 size={15}/></button>
            </header>
            <Select label={`${label} 类型`} value={type} options={types}
              onChange={type=>edit(ref.id,{type})}/>
            <Slider label={`${label} 强度`} value={ref.strength??1} min={0} max={5} step={.05}
              onChange={strength=>edit(ref.id,{strength:Math.max(-5,Math.min(5,strength))})}/>
            {(type==='character'||type==='character&style')&&<Toggle label="尽量保留原服装" checked={ref.sameOutfit}
              onChange={sameOutfit=>edit(ref.id,{sameOutfit})}/>}
          </article>;
        })}
        <p className="v5-precise-fee">每张启用的参考图，为每张生成图附加 5 Anlas。</p>
        {refs.length<MAX_PRECISE_REFERENCES&&!busy&&<ImageInput label="新增精准参考图" value="" onChange={addImage}
          help="图片先保存在本机，点生成时才会随请求发送。"/>}
        {busy&&<p role="status">正在准备参考图…</p>}
        {error&&<p role="alert" className="field-error">{error}</p>}
      </>}
    </div>
  </details>;
}
