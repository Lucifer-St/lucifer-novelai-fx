import {useEffect,useRef,useState} from 'react';
import {Crop,Move,RotateCcw,X} from 'lucide-react';
import ImageInput from './ImageInput';
import {loadImage} from '../lib/image.mjs';
import {cropSquare,panCrop,renderCover} from '../lib/cover-crop.mjs';

export default function CoverImageInput({value,onChange,label='卡片封面'}){
 const [pending,setPending]=useState(null),original=useRef(null),lastCrop=useRef(value);
 useEffect(()=>{if(value!==lastCrop.current){original.current=null;lastCrop.current=value;}},[value]);
 return <div className="cover-image-input" data-local-image-drop>
  <ImageInput label={label} value={value} help="上传后可拖动、缩放裁剪为 1:1 封面；原文件保留。" onChange={source=>{if(!source){original.current=null;lastCrop.current='';onChange('');return;}original.current=source;setPending(source);}}/>
  {value&&<button className="text-button cover-recrop" type="button" onClick={()=>setPending(original.current||value)}><Crop size={14}/>重新裁剪封面</button>}
  {pending&&<CoverCropDialog source={pending} onCancel={()=>setPending(null)} onApply={cover=>{lastCrop.current=cover;onChange(cover);setPending(null);}}/>}
 </div>;
}

function CoverCropDialog({source,onCancel,onApply}){
 const dialog=useRef(null),viewport=useRef(null),drag=useRef(null),[image,setImage]=useState(null),[error,setError]=useState(''),[edge,setEdge]=useState(320),[crop,setCrop]=useState(null),[dragging,setDragging]=useState(false);
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();previous?.focus?.({preventScroll:true});};},[]);
 useEffect(()=>{let active=true;loadImage(source).then(im=>{if(active){setImage(im);setCrop(cropSquare(im.naturalWidth,im.naturalHeight));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[source]);
 useEffect(()=>{if(!viewport.current)return;const observer=new ResizeObserver(([entry])=>setEdge(entry.contentRect.width));observer.observe(viewport.current);return()=>observer.disconnect();},[]);
 const changeZoom=value=>image&&setCrop(c=>cropSquare(image.naturalWidth,image.naturalHeight,value,c.centerX,c.centerY));
 const move=(dx,dy)=>image&&setCrop(c=>panCrop(image.naturalWidth,image.naturalHeight,c,dx,dy,edge));
 function finish(event){if(drag.current?.id!==event.pointerId)return;drag.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
 const scale=crop?edge/crop.side:1;
 return <dialog ref={dialog} className="cover-crop-dialog" aria-label="裁剪卡片封面" onCancel={e=>{e.preventDefault();e.stopPropagation();onCancel();}}>
  <header><div><strong>为卡片选一幅画面</strong><p>拖动图片调整位置，缩放选择你想保留的部分。</p></div><button aria-label="取消封面裁剪" onClick={onCancel}><X size={18}/></button></header>
  <div ref={viewport} className={`cover-crop-viewport${dragging?' dragging':''}`} role="group" aria-label="封面裁剪选区" tabIndex={0}
   onPointerDown={e=>{if(!image||drag.current)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};setDragging(true);}}
   onPointerMove={e=>{if(drag.current?.id!==e.pointerId)return;move(e.clientX-drag.current.x,e.clientY-drag.current.y);drag.current={...drag.current,x:e.clientX,y:e.clientY};}}
   onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
   onKeyDown={e=>{const d={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[e.key];if(d){e.preventDefault();move(...d);}}}>
   {image&&crop?<img src={source} draggable="false" alt="裁剪中的封面" style={{width:image.naturalWidth*scale,height:image.naturalHeight*scale,left:-crop.x*scale,top:-crop.y*scale}}/>:<span>{error||'正在读取图片…'}</span>}
   <div className="cover-crop-grid" aria-hidden="true"/><span className="cover-ratio">1 : 1</span>
  </div>
  <label className="cover-zoom"><span><Move size={14}/>缩放</span><input aria-label="封面缩放" type="range" min="1" max="4" step=".01" value={crop?.zoom||1} disabled={!image} onChange={e=>changeZoom(Number(e.target.value))}/><output>{Math.round((crop?.zoom||1)*100)}%</output></label>
  {error&&<p className="field-error" role="alert">{error}</p>}
  <footer><button disabled={!image} onClick={()=>setCrop(cropSquare(image.naturalWidth,image.naturalHeight))}><RotateCcw size={14}/>居中重置</button><button onClick={onCancel}>取消</button><button className="primary" disabled={!image||!crop} onClick={()=>{try{onApply(renderCover(image,crop));}catch(e){setError(e.message);}}}>使用这个封面</button></footer>
  <small>只保存 512 × 512 的裁剪副本，不改变原始图片。方向键也可移动选区。</small>
 </dialog>;
}
