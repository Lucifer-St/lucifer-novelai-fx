import {useEffect,useRef,useState} from 'react';
const KEY='lucifer-panel-layout-v1';
function saved(){try{const x=JSON.parse(localStorage.getItem(KEY));return x?.version===1&&[x.left,x.right].every(n=>Number.isFinite(n)&&n>=240&&n<=10000)?{left:x.left,right:x.right}:null;}catch{return null;}}
export default function usePanelLayout({hidden,narrow,page}){
 const ref=useRef(null),preferred=useRef(undefined),drag=useRef(null),frame=useRef(null);
 if(preferred.current===undefined)preferred.current=saved();
 const [sizes,setSizes]=useState({left:0,right:0});
 function measure(){const el=ref.current;if(!el||!el.clientWidth||!el.getClientRects().length)return null;const css=getComputedStyle(el),left=el.querySelector(':scope > .left-panel'),right=el.querySelector(':scope > .right-panel');return {el,available:el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-2*parseFloat(css.columnGap||0),left:left?.getBoundingClientRect().width||0,right:right?.getBoundingClientRect().width||0};}
 function apply(value,commit=false){
  const m=measure();if(!m||narrow)return;
  if(value){
   const rightMin=hidden?58:240,leftMin=260,space=m.available-240;
   let left=Math.max(leftMin,value.left),right=hidden?58:Math.max(rightMin,value.right);
   const extra=Math.max(0,left+right-space),flex=Math.max(1,left-leftMin+right-rightMin);
   left-=extra*(left-leftMin)/flex;right-=extra*(right-rightMin)/flex;
   m.el.style.setProperty('--panel-columns',`${Math.max(leftMin,left)}px minmax(0,1fr) ${Math.max(rightMin,right)}px`);
   m.el.dataset.userColumns='true';
  }else{delete m.el.dataset.userColumns;m.el.style.removeProperty('--panel-columns');}
  const actual=measure();m.el.style.setProperty('--panel-left',`${actual.left}px`);m.el.style.setProperty('--panel-right',`${actual.right}px`);
  if(commit)setSizes({left:Math.round(actual.left),right:Math.round(actual.right)});
 }
 function persist(){try{if(preferred.current)localStorage.setItem(KEY,JSON.stringify({version:1,...preferred.current}));else localStorage.removeItem(KEY);}catch{}}
 function finish(){if(frame.current){cancelAnimationFrame(frame.current);frame.current=null;}if(!drag.current)return;if(drag.current.next)apply(drag.current.next);const current=measure();if(current)preferred.current={left:current.left,right:hidden?preferred.current?.right||296:current.right};drag.current=null;ref.current?.classList.remove('is-resizing');persist();apply(preferred.current,true);}
 function start(side,event){if(event.button!==0||narrow||(side==='right'&&hidden))return;const m=measure();if(!m)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={side,x:event.clientX,left:m.left,right:m.right};m.el.classList.add('is-resizing');}
 function move(event){const d=drag.current;if(!d)return;const dx=event.clientX-d.x,m=measure();const next={left:d.left,right:d.right};if(d.side==='left')next.left=Math.max(260,Math.min(d.left+dx,m.available-d.right-240));else next.right=Math.max(240,Math.min(d.right-dx,m.available-d.left-240));d.next=next;if(frame.current)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{frame.current=null;apply(next);});}
 function reset(){drag.current=null;if(frame.current)cancelAnimationFrame(frame.current);preferred.current=null;ref.current?.classList.remove('is-resizing');persist();apply(null,true);}
 function keyboard(side,event){if(event.key==='Home'){event.preventDefault();reset();return;}if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const m=measure(),delta=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?40:12);if(!m)return;const next={left:m.left,right:hidden?preferred.current?.right||296:m.right};if(side==='left')next.left=Math.max(260,Math.min(m.left+delta,m.available-m.right-240));else next.right=Math.max(240,Math.min(m.right-delta,m.available-m.left-240));preferred.current=next;apply(next,true);persist();}
 useEffect(()=>{const el=ref.current;if(!el)return;apply(preferred.current,true);const observer=new ResizeObserver(()=>apply(preferred.current,true));observer.observe(el);return()=>{observer.disconnect();if(frame.current)cancelAnimationFrame(frame.current);drag.current=null;};},[hidden,narrow,page]);
 return {ref,reset,separator:side=>({role:'separator',tabIndex:0,'aria-label':side==='left'?'调整提示词与图片栏宽度':'调整图片与右侧栏宽度','aria-orientation':'vertical','aria-valuenow':sizes[side],'aria-valuemin':side==='left'?260:240,onPointerDown:e=>start(side,e),onPointerMove:move,onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish,onDoubleClick:reset,onKeyDown:e=>keyboard(side,e)})};
}
