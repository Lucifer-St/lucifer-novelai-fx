import {memo,useState} from 'react';
import {CircleAlert,LoaderCircle} from 'lucide-react';
import {getLoadingSkin,formatElapsed} from '../lib/loading-skins.mjs';
const Portrait=memo(function Portrait({src,compact,width=1254,height=1254}){
 const [broken,setBroken]=useState(false);
 if(broken)return <span className="loading-art-fallback" aria-hidden="true">✧</span>;
 return <img className="loading-character-art" src={src} alt="" width={width} height={height} decoding="async" loading={compact?'lazy':'eager'} onError={()=>setBroken(true)}/>;
});
/** Presentation only. Never owns request, retry, selection or timer state. */
export default function LoadingArtwork({skinId,elapsed=0,failed=false,error='',compact=false,motion='system',streamEvents=0,hasStream=false}){
 const skin=getLoadingSkin(skinId);
 return <div className={'loading-card-visual loading-layout-'+(skin.layout||'cutout')+(compact?' loading-card-compact':'')+(motion==='off'?' loading-motion-off':'')+(failed?' loading-card-failed':'')+(hasStream?' loading-has-stream':'')} style={{'--loading-accent':skin.accent}} data-loading-skin={skin.id}>
  {!failed&&skin.image&&!hasStream?<Portrait key={skin.image} src={skin.image} compact={compact} width={skin.width} height={skin.height}/>:<span className="loading-state-symbol" aria-hidden="true">{failed?<CircleAlert size={compact?22:30}/>:hasStream?null:<LoaderCircle size={compact?22:30} className="spin"/>}</span>}
  <div className="loading-card-copy">
   {!compact&&<strong role="status">{failed?'这次生成未完成':skin.title}</strong>}
   {!failed&&<div className="loading-indeterminate" role={compact?undefined:'progressbar'} aria-label={compact?undefined:'等待生成结果'}><span/></div>}
   <span className="loading-card-meta">{!compact&&<small>{failed?'请核对请求状态':'等待最终图像'}</small>}<time aria-live="off">{formatElapsed(elapsed)}</time></span>
   {!compact&&<p>{failed?error||'没有收到最终结果；不会自动重试。':hasStream?'已收到中间预览，仍在等待最终图像。':'可以继续查看与保存旧图，完成后不会打断你的浏览。'}</p>}
   {!compact&&!failed&&streamEvents>0&&<small className="loading-events">已接收 {streamEvents} 个事件 · 不代表完成比例</small>}
  </div>
 </div>;
}
