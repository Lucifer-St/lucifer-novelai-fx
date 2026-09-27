import {useLayoutEffect,useRef,useState} from 'react';
import {Check,Move,LocateFixed} from 'lucide-react';
import {NumberField} from './Fields';
import {positionValue,pointerPosition,fitPositionCanvas} from '../lib/character-position.mjs';
const colors=['#397ef0','#9b67c7','#d37665','#3d9c91','#b98b35','#6677b6'];
export default function CharacterPositionCanvas({width,height,characters,selectedId,onSelect,onMove,onFinish,grid=false}){
 const area=useRef(null),canvas=useRef(null),drag=useRef(null),[size,setSize]=useState({width:300,height:300});
 const selected=characters.find(c=>c.id===selectedId)||characters[0],selectedIndex=characters.indexOf(selected);
 useLayoutEffect(()=>{const el=area.current;if(!el)return;const resize=()=>setSize(fitPositionCanvas(width,height,el.clientWidth-32,el.clientHeight-32));resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();},[width,height]);
 function begin(e,character=null){
  if(e.button!==0||!selected)return;e.preventDefault();e.stopPropagation();
  const target=character||selected,rect=canvas.current.getBoundingClientRect();onSelect(target.id);
  drag.current={id:target.id,pointerId:e.pointerId,offsetX:character?e.clientX-rect.left-positionValue(target.x)*rect.width:0,offsetY:character?e.clientY-rect.top-positionValue(target.y)*rect.height:0};
  e.currentTarget.setPointerCapture(e.pointerId);
  if(!character)onMove(target.id,pointerPosition(rect,e.clientX,e.clientY));
 }
 function move(e){const active=drag.current;if(!active||active.pointerId!==e.pointerId)return;onMove(active.id,pointerPosition(canvas.current.getBoundingClientRect(),e.clientX,e.clientY,active.offsetX,active.offsetY));}
 function finish(e){if(drag.current?.pointerId!==e.pointerId)return;drag.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function keyMove(e,c){const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();const step=grid?.2:e.shiftKey ? 0.001 : 0.01;onSelect(c.id);onMove(c.id,{x:positionValue(Number(c.x)+delta[0]*step),y:positionValue(Number(c.y)+delta[1]*step)});}
 return <section className="position-workspace" aria-label="角色位置编辑器">
   <header><div><strong><Move size={16}/>角色位置</strong><small>{width} × {height} · 拖动编号或点击画布放置</small></div><button className="position-done" onClick={onFinish}><Check size={15}/>完成定位</button></header>
   <div className="position-character-tabs" role="group" aria-label="选择定位角色">{characters.map((c,i)=><button key={c.id} aria-pressed={selected?.id===c.id} className={c.enabled===false?'muted-character':''} style={{'--role-color':colors[i%colors.length]}} onClick={()=>onSelect(c.id)} title={c.prompt||`角色 ${i+1}`}><i>{i+1}</i><span>{c.promptCards?.[0]?.title||`角色 ${i+1}`}{c.enabled===false?' · 未启用':''}</span></button>)}</div>
   <div className="position-stage-area" ref={area}>
     <div ref={canvas} className="position-stage" style={{...size,...grid?{backgroundImage:"linear-gradient(to right, #8883 1px, transparent 1px),linear-gradient(to bottom, #8883 1px, transparent 1px)",backgroundSize:"20% 20%"}:{}}} role="group" aria-label="角色定位画布" onPointerDown={e=>begin(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{drag.current=null;}}>
       <span className="position-axis origin">0, 0</span><span className="position-axis corner">1, 1</span>
       {characters.map((c,i)=><button key={c.id} type="button" className={`position-marker${c.id===selected?.id?' selected':''}${c.enabled===false?' muted-character':''}`} style={{left:`${positionValue(c.x)*100}%`,top:`${positionValue(c.y)*100}%`,'--role-color':colors[i%colors.length]}} aria-label={`拖动角色 ${i+1}`} aria-pressed={c.id===selected?.id} title={`角色 ${i+1} · X ${positionValue(c.x)} / Y ${positionValue(c.y)}`} onPointerDown={e=>begin(e,c)} onFocus={()=>onSelect(c.id)} onKeyDown={e=>keyMove(e,c)}>{i+1}</button>)}
       {!characters.length&&<p>先在左侧添加一个角色</p>}
     </div>
   </div>
   <footer>{selected&&<><strong>角色 {selectedIndex+1}</strong><NumberField label="选中角色 X" min={0} max={1} step={.001} value={selected.x} onChange={v=>onMove(selected.id,{x:positionValue(v),y:positionValue(selected.y)})}/><NumberField label="选中角色 Y" min={0} max={1} step={.001} value={selected.y} onChange={v=>onMove(selected.id,{x:positionValue(selected.x),y:positionValue(v)})}/><button title="选中角色居中" onClick={()=>onMove(selected.id,{x:.5,y:.5})}><LocateFixed size={15}/>居中</button></>}<small>{grid?'V4.5 · 5 × 5 位置网格':'左上角为原点 · 方向键移动 0.01，Shift 精调 0.001'}</small></footer>
 </section>;
}
