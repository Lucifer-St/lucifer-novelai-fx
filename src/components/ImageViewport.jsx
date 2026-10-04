import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ZoomIn, ZoomOut} from 'lucide-react';
import {fitImage, boundPan, anchoredZoom} from '../lib/image-viewport.mjs';
import './image-viewport.css';

// A mounted viewer owns only display state. It never changes image bytes or requests.
const ImageViewport = forwardRef(function ImageViewport({src, alt, onScaleChange}, ref) {
  const host = useRef(null), natural = useRef(null), drag = useRef(null);
  const current = useRef({scale: 1, x: 0, y: 0, fit: true});
  const [view, setView] = useState(current.current), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false), [dragging, setDragging] = useState(false);
  const scaleCallback = useRef(onScaleChange); scaleCallback.current = onScaleChange;
  function size() { return {width: host.current?.clientWidth || 1, height: host.current?.clientHeight || 1}; }
  function commit(next) {current.current = next; setView(next); scaleCallback.current?.(next.scale);}
  function fit() {if(natural.current) commit({scale: fitImage(size(), natural.current), x: 0, y: 0, fit: true});}
  function zoom(scale, point = {x: 0, y: 0}) {if(natural.current) commit(anchoredZoom(current.current, scale, point, size(), natural.current));}
  function point(event) {const rect = host.current.getBoundingClientRect(); return {x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2};}
  useImperativeHandle(ref, () => ({fit, original: () => zoom(1), zoomBy: factor => zoom(current.current.scale * factor)}));
  useEffect(() => {
    const el = host.current;
    const resize = new ResizeObserver(() => {if(!natural.current || !el.clientWidth || !el.clientHeight)return; if(current.current.fit)fit(); else commit({...current.current, ...boundPan(current.current, current.current.scale, size(), natural.current)});});
    resize.observe(el);
    const wheel = event => {if(!natural.current)return; event.preventDefault(); const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1); zoom(current.current.scale * Math.exp(-delta * 0.0015), point(event));};
    el.addEventListener('wheel', wheel, {passive: false});
    return () => {resize.disconnect(); el.removeEventListener('wheel', wheel);};
  }, []);
  function endDrag() {drag.current = null; setDragging(false);}
  return <div ref={host} className={'image-stage image-viewport' + (dragging ? ' is-dragging' : '')} tabIndex={0} role="region" aria-label="图片查看器" aria-description="滚轮缩放，拖动平移；双击切换适应画布和原始尺寸。键盘加减缩放，0 适应，1 原始尺寸。"
    onPointerDown={event => {if(event.button !== 0 || !natural.current || !event.isPrimary)return; event.preventDefault(); host.current.focus({preventScroll:true}); host.current.setPointerCapture(event.pointerId); drag.current = {id:event.pointerId, x:event.clientX, y:event.clientY, view:current.current}; setDragging(true);}}
    onPointerMove={event => {const d=drag.current; if(!d || d.id!==event.pointerId)return; commit({...current.current, ...boundPan({x:d.view.x+event.clientX-d.x, y:d.view.y+event.clientY-d.y}, current.current.scale, size(), natural.current)});}}
    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onDoubleClick={event => {if(current.current.fit)zoom(1, point(event)); else fit();}}
    onKeyDown={event => {if(event.ctrlKey || event.metaKey || event.altKey)return; const key=event.key;if(['+','=','-','0','1','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))event.preventDefault();else return;
      if(key==='0')fit();else if(key==='1')zoom(1);else if(key==='+'||key==='=')zoom(current.current.scale*1.25);else if(key==='-')zoom(current.current.scale/1.25);else if(natural.current)commit({...current.current,...boundPan({x:current.current.x+(key==='ArrowLeft'?40:key==='ArrowRight'?-40:0),y:current.current.y+(key==='ArrowUp'?40:key==='ArrowDown'?-40:0)},current.current.scale,size(),natural.current)});
    }}>
    <img src={src} alt={alt} draggable={false} onLoad={event => {natural.current={width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight};setLoaded(true);setFailed(false);fit();}} onError={()=>{setFailed(true);setLoaded(false);scaleCallback.current?.(null);}}
      style={{visibility:loaded?'visible':'hidden',width:natural.current?.width,height:natural.current?.height,transform:`translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}/>
    {failed?<p role="alert">图片未能加载，请从历史记录重新选择。</p>:loaded&&<span className="image-gesture-note">滚轮缩放 · 拖动平移 · 双击适应 / 1:1</span>}
  </div>;
});
export default ImageViewport;
export function ImageViewControls({viewer, scale, enabled, focused, onFocus}) {
  return <div className="image-view-controls">
    <div className="image-scale-controls" aria-label="图片缩放">
      <button type="button" title="缩小" aria-label="缩小" disabled={!enabled} onClick={()=>viewer.current?.zoomBy(0.8)}><ZoomOut size={15}/></button>
      <output aria-label="图片缩放比例">{enabled&&scale?`${Math.round(scale*100)}%`:'—'}</output>
      <button type="button" title="放大" aria-label="放大" disabled={!enabled} onClick={()=>viewer.current?.zoomBy(1.25)}><ZoomIn size={15}/></button>
      <button type="button" title="适合画布" disabled={!enabled} onClick={()=>viewer.current?.fit()}>适应</button>
      <button type="button" title="原始尺寸（1:1）" disabled={!enabled} onClick={()=>viewer.current?.original()}>1:1</button>
    </div>
    <button type="button" className="image-focus-toggle" aria-pressed={focused} onClick={onFocus}>{focused?'退出专注 · Esc':'专注看图'}</button>
  </div>;
}
