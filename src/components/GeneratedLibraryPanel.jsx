import {useEffect,useRef,useState} from 'react';
import {zipSync,strToU8} from 'fflate';
import {api,downloadData} from '../lib/api.mjs';
import {saveBlob} from '../lib/platform.mjs';
import './generated-library.css';

const keyOf=item=>`${item.result_id}:${item.image_index}`;
const describe=value=>value===undefined||value===null||value===''?'未知':String(value);
const short=value=>typeof value==='string'?value.slice(0,120):JSON.stringify(value)?.slice(0,120)||'未知';
const collect=(value,prefix='',out={})=>{
 if(!value||typeof value!=='object'||Array.isArray(value)){out[prefix]=value;return out;}
 for(const [key,item] of Object.entries(value)){
  if(['source','mask','image','images','reference_image','reference_image_multiple'].includes(key))continue;
  const name=prefix?`${prefix}.${key}`:key;
  if(item&&typeof item==='object'&&!Array.isArray(item))collect(item,name,out);else out[name]=item;
 }
 return out;
};
async function cleanFromOriginal(url){
 const response=await fetch(url);if(!response.ok)throw Error('原始图片不可读取');
 const bitmap=await createImageBitmap(await response.blob());
 try{if(bitmap.width*bitmap.height>32_000_000)throw Error('图片超过 3200 万像素，请缩小批次或使用服务端去参数导出');
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  for(let offset=0;offset<pixels.data.length;offset+=4){pixels.data[offset]&=254;pixels.data[offset+1]&=254;pixels.data[offset+2]&=254;if(pixels.data[offset+3]>0)pixels.data[offset+3]|=1;}
  context.putImageData(pixels,0,0);
  return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('去参数 PNG 导出失败')),'image/png'));
 }finally{bitmap.close();}
}
async function exportImage(item,keep){
 if(keep){const response=await fetch(item.url);if(!response.ok)throw Error('原始图片不可读取');return response.blob();}
 const response=await fetch(`/api/share-image?id=${encodeURIComponent(item.result_id)}&index=${item.image_index}&metadata=strip`);
 if(response.status===404)return cleanFromOriginal(item.url);
 if(!response.ok){let problem;try{problem=(await response.json()).error?.message;}catch{}throw Error(problem||'去参数图片不可读取');}
 return response.blob();
}
export function imageDifferences(a,b){
 const left=collect({model:a.model,mode:a.mode,seed:a.seed,prompt:a.prompt,finalPrompt:a.final_prompt,...a.metadata});
 const right=collect({model:b.model,mode:b.mode,seed:b.seed,prompt:b.prompt,finalPrompt:b.final_prompt,...b.metadata});
 return [...new Set([...Object.keys(left),...Object.keys(right)])].sort().filter(key=>JSON.stringify(left[key])!==JSON.stringify(right[key])).map(key=>({key,before:left[key],after:right[key]}));
}

export default function GeneratedLibraryPanel({onSelect,onRestore,onError}){
 const [draft,setDraft]=useState({q:'',seed:'',from:'',to:'',model:'',mode:'',favorite:false});
 const [filters,setFilters]=useState(draft),[items,setItems]=useState([]),[cursor,setCursor]=useState(null),[selected,setSelected]=useState([]),[comparison,setComparison]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[keepMetadata,setKeepMetadata]=useState(false),[status,setStatus]=useState(null),[notice,setNotice]=useState('');
 const generation=useRef(0),annotationsPicker=useRef(null);
 const report=error=>onError?.(error?.message||String(error));
 async function refreshStatus(quiet=false){try{setStatus(await api('/api/generated-library/status'));}catch(error){if(!quiet)report(error);}}
 async function indexAction(action){try{await api(`/api/generated-library/${action}`,{method:'POST',body:{}});await refreshStatus();if(action==='rebuild'){setItems([]);setCursor(null);setNotice('正在重新建立查询索引；收藏与手工标签保留。');}}catch(error){report(error);}}
 async function exportAnnotations(){try{await downloadData(await api('/api/generated-library/annotations'),`Lucifer-FX-图库收藏标签-${new Date().toISOString().slice(0,10)}.json`);setNotice('图库收藏与标签备份已导出。');}catch(error){report(error);}}
 async function importAnnotations(file){if(!file)return;try{if(file.size>8*1024*1024)throw Error('图库注释备份不能超过 8 MiB');const bundle=JSON.parse(await file.text());const result=await api('/api/generated-library/annotations',{method:'POST',body:bundle});setNotice(`已合并 ${result.imported} 条图库收藏与标签；原始图片未改动。`);setSelected([]);await load(filters);}catch(error){report(error);}}
 async function load(nextFilters=filters,nextCursor=null,append=false){const token=++generation.current;setLoading(true);
  try{const params=new URLSearchParams({limit:'40'});for(const [key,value] of Object.entries(nextFilters))if(value)params.set(key,key==='favorite'?'1':value);if(nextCursor)params.set('cursor',nextCursor);
   const data=await api(`/api/generated-library?${params}`);if(token!==generation.current)return;
   setItems(previous=>append?[...previous,...data.items.filter(item=>!previous.some(old=>keyOf(old)===keyOf(item)))]:data.items);
   setCursor(data.nextCursor||null);setStatus(data.index||null);
  }catch(error){if(token===generation.current)report(error);}finally{if(token===generation.current)setLoading(false);}
 }
 useEffect(()=>{load(filters);return()=>{generation.current++;};},[filters]);
 useEffect(()=>{const timer=setInterval(()=>{void refreshStatus(true);},2000);return()=>clearInterval(timer);},[]);
 const patch=(field,value)=>setDraft(current=>({...current,[field]:value}));
 const checked=item=>selected.includes(keyOf(item));
 const toggle=item=>setSelected(previous=>previous.includes(keyOf(item))?previous.filter(key=>key!==keyOf(item)):[...previous,keyOf(item)]);
 async function updateAnnotation(item,patch){try{const result=await api('/api/generated-library/annotation',{method:'PATCH',body:{id:item.result_id,index:item.image_index,...patch}});setItems(previous=>previous.map(current=>keyOf(current)===keyOf(item)?{...current,favorite:result.favorite,tags:result.tags}:current));}catch(error){report(error);}}
 async function open(item,action){try{const detail=await api(`/api/generated-library/item?id=${encodeURIComponent(item.result_id)}&index=${item.image_index}`);if(!detail.entry)throw Error('原始历史记录不可读取，无法回填参数。');
  if(action==='restore')onRestore?.(detail.entry,item.image_index,detail);else onSelect?.(detail.entry,item.image_index,detail);
 }catch(error){report(error);}}
 async function compare(item){try{const detail=await api(`/api/generated-library/item?id=${encodeURIComponent(item.result_id)}&index=${item.image_index}`);setComparison(previous=>previous.some(entry=>keyOf(entry)===keyOf(detail))?previous.filter(entry=>keyOf(entry)!==keyOf(detail)):[...previous.slice(-1),detail]);}catch(error){report(error);}}
 async function exportSelected(){const targets=items.filter(item=>selected.includes(keyOf(item)));if(!targets.length)return;
  if(targets.length>40){report(Error('单次最多导出 40 张，请分批选择。'));return;}
  const keep=keepMetadata;
  setBusy(true);setNotice('正在从本机读取所选图片…');
  try{const files={},manifest=[];let bytesTotal=0;
   for(const item of targets){const blob=await exportImage(item,keep);
    const bytes=new Uint8Array(await blob.arrayBuffer());bytesTotal+=bytes.byteLength;if(bytesTotal>160*1024*1024)throw Error('本批图片超过 160 MiB，请缩小批次后导出。');
    const extension=blob.type==='image/png'?'.png':blob.type==='image/jpeg'?'.jpg':blob.type==='image/webp'?'.webp':item.filename.match(/\.(png|jpe?g|webp)$/i)?.[0]||'.png';
    const filename=`${item.result_id}-${item.image_index+1}${extension}`;files[filename]=bytes;manifest.push({file:filename,id:item.result_id,index:item.image_index,metadata:keep?'keep':'strip'});
   }
   files['manifest.json']=strToU8(JSON.stringify({format:'lucifer-fx-generated-library-export',version:1,images:manifest},null,2));
   await saveBlob(new Blob([zipSync(files,{level:0})],{type:'application/zip'}),`Lucifer-FX-图库-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`);
   setNotice(`已导出 ${targets.length} 张图片。`);
  }catch(error){report(error);setNotice('导出未完成，原图未改动。');}finally{setBusy(false);}
 }
 const left=comparison[0],right=comparison[1];
 return <section className="generated-library" aria-label="生成图库">
  <header><div><h3>生成图库</h3><p>搜索历史图片与真实参数；收藏和手工标签保存在本机。</p></div>{status&&<small>{status.running?`正在建立索引 ${status.scanned}/${status.total}`:`已索引 ${status.indexed} 张`}{status.broken?` · ${status.broken} 条记录损坏`:''}{status.missing?` · ${status.missing} 张原件缺失`:''}{status.duplicates?` · ${status.duplicates} 个重复文件名`:''}</small>}</header>
  <form className="generated-library-filters" onSubmit={event=>{event.preventDefault();setSelected([]);setFilters({...draft});}}>
   <label>提示词 / 标签<input aria-label="图库搜索" value={draft.q} onChange={event=>patch('q',event.target.value)} placeholder="搜索 prompt、标签、文件名"/></label>
   <label>Seed<input aria-label="图库 Seed" inputMode="numeric" value={draft.seed} onChange={event=>patch('seed',event.target.value)} placeholder="精确查询"/></label>
   <label>起始日期<input aria-label="图库起始日期" type="date" value={draft.from} onChange={event=>patch('from',event.target.value)}/></label>
   <label>截止日期<input aria-label="图库截止日期" type="date" value={draft.to} onChange={event=>patch('to',event.target.value)}/></label>
   <label>模型<input aria-label="图库模型" value={draft.model} onChange={event=>patch('model',event.target.value)} placeholder="模型 ID"/></label>
   <label>模式<select aria-label="图库模式" value={draft.mode} onChange={event=>patch('mode',event.target.value)}><option value="">全部</option><option value="generate">文生图</option><option value="img2img">图生图</option><option value="infill">局部重绘</option></select></label>
   <label className="generated-library-check"><input type="checkbox" checked={draft.favorite} onChange={event=>patch('favorite',event.target.checked)}/>仅收藏</label>
   <button type="submit" disabled={loading}>搜索</button>
  </form>
  <div className="generated-library-actions"><span>{selected.length} 张已选</span><label><input type="checkbox" checked={keepMetadata} onChange={event=>setKeepMetadata(event.target.checked)}/>导出时保留图片参数</label><button disabled={busy||!selected.length} onClick={exportSelected}>批量导出 ZIP</button><button disabled={!selected.length} onClick={()=>setSelected([])}>清空选择</button><button onClick={()=>{setItems([]);load(filters);}}>刷新</button><button onClick={exportAnnotations}>备份收藏 / 标签</button><button onClick={()=>annotationsPicker.current?.click()}>导入收藏 / 标签</button><input ref={annotationsPicker} hidden type="file" accept="application/json,.json" onChange={event=>{void importAnnotations(event.target.files?.[0]);event.target.value='';}}/><button onClick={()=>indexAction(status?.paused?'resume':'pause')} disabled={!status?.running}>{status?.paused?'继续索引':'暂停索引'}</button><button onClick={()=>indexAction('rebuild')}>重建索引</button></div>
  {notice&&<p role="status" className="generated-library-notice">{notice}</p>}
  {status?.lastError&&<p className="generated-library-warning">索引提示：{status.lastError}</p>}
  <div className="generated-library-grid">{items.map(item=><article key={keyOf(item)} className="generated-library-card">
   <div className="generated-library-thumb">{item.hasFile&&item.url?<img loading="lazy" src={item.url} alt={item.prompt||item.filename} onError={event=>{event.currentTarget.style.display='none';}}/>:<span>原件不可用</span>}</div>
   <div className="generated-library-card-body"><div className="generated-library-card-top"><label><input type="checkbox" checked={checked(item)} onChange={()=>toggle(item)}/>选择</label><button aria-label={item.favorite?'取消收藏':'收藏'} onClick={()=>updateAnnotation(item,{favorite:!item.favorite})}>{item.favorite?'★':'☆'}</button></div>
    <p title={item.prompt}>{item.prompt||item.final_prompt||item.filename||'无提示词'}</p><small>{item.created_at?.slice(0,19).replace('T',' ')} · Seed {describe(item.seed)}</small><small>{item.model||'未知模型'} · {item.mode||'未知模式'}</small>
    <input aria-label={`手工标签 ${item.filename}`} title="逗号分隔，回车保存" defaultValue={item.tags.join(', ')} key={`${keyOf(item)}-${item.tags.join('|')}`} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();updateAnnotation(item,{tags:event.currentTarget.value.split(/[，,]/).map(x=>x.trim()).filter(Boolean)});event.currentTarget.blur();}}} placeholder="手工标签，回车保存"/>
    <div className="generated-library-card-buttons"><button onClick={()=>open(item,'select')}>查看</button><button onClick={()=>open(item,'restore')}>回填</button><button onClick={()=>compare(item)}>对比</button></div>
   </div></article>)}{!loading&&!items.length&&<p className="generated-library-empty">没有匹配的图片。首次打开时索引会在后台逐批建立，可稍后刷新。</p>}</div>
  {loading&&<p className="generated-library-loading">正在读取图库…</p>}{cursor&&<button className="generated-library-more" disabled={loading} onClick={()=>load(filters,cursor,true)}>加载更早图片</button>}
  {!!comparison.length&&<div className="generated-library-compare"><header><h4>两图对照</h4><button onClick={()=>setComparison([])}>清空</button></header><div className="generated-library-compare-images">{comparison.map((item,index)=><figure key={keyOf(item)}><figcaption>{index?'右':'左'} · {item.filename}</figcaption>{item.hasFile&&item.url?<img src={item.url} alt={item.filename}/>:<p>原件不可用</p>}<small>Seed {describe(item.seed)} · {item.model||'未知模型'}</small></figure>)}</div>{left&&right&&<details open><summary>{imageDifferences(left,right).length} 处参数或提示词差异</summary><div className="generated-library-differences">{imageDifferences(left,right).map(diff=><div key={diff.key}><strong>{diff.key}</strong><span>{short(diff.before)}</span><span>{short(diff.after)}</span></div>)}</div></details>}</div>}
 </section>;
}
