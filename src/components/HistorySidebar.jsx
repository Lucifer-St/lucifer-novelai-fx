import {Code2,History,RefreshCw,ArrowUp} from 'lucide-react';
import LoadingArtwork from './LoadingArtwork';
import './history-sidebar.css';

export default function HistorySidebar({history,phase,error,nextCursor,loadingMore,scrollRef,selectedId,pending,viewPending,elapsed,appearance,pendingAppearance,onSelect,onPending,onRefresh,onOlder,onSearch}){
 return <section className="history-panel history-sidebar" aria-label="生成历史">
  <header className="section-label" data-character-role="history"><span><History size={14}/>历史记录 <small>{phase==='loading'&&!history.length?'正在读取…':phase==='error'?'读取失败':`${history.length} 次请求`}</small></span></header>
  <div className="history-actions"><button type="button" onClick={onSearch}>搜索图库</button><button type="button" title="回到最新记录" aria-label="回到最新记录" onClick={()=>scrollRef.current?.scrollTo({top:0,behavior:'smooth'})}><ArrowUp size={14}/></button><button type="button" title="刷新历史记录" aria-label="刷新历史记录" onClick={onRefresh}><RefreshCw size={14}/></button></div>
  <div className="history-strip" id="history-strip" ref={scrollRef}>
   {pending&&<button type="button" className={`history-item pending-history${viewPending?' selected':''}`} aria-label={pending.status==='failed'?'查看未完成任务':'查看正在生成的新图'} aria-pressed={viewPending} onClick={onPending}><span className="history-thumbnail"><LoadingArtwork skinId={pendingAppearance.loadingSkin} elapsed={elapsed} failed={pending.status==='failed'} compact motion={appearance.motion}/></span><small>{pending.status==='failed'?'未完成':'正在生成'}</small></button>}
   {history.map(h=>{const images=h.images?.filter(image=>!image.deletedAt)||[],chosen=!viewPending&&selectedId===h.id;return <button type="button" key={h.id} className={'history-item'+(chosen?' selected':'')} aria-pressed={chosen} title={h.prompt||h.endpoint||h.id} onClick={()=>onSelect(h)}><span className="history-thumbnail">{images.length?<img src={images[0].url} alt="历史图像" loading="lazy" decoding="async"/>:<Code2 size={25}/>} {images.length>1&&<span className="history-count">{images.length} 张</span>}</span><small>{h.createdAt?<time dateTime={h.createdAt}>{new Date(h.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>:'响应'}</small></button>;})}
   {!history.length&&<p className="history-empty">{phase==='loading'?'正在读取本地历史记录…':phase==='error'?`历史暂时无法读取：${error}。可点击刷新重试。`:'生成的图片会显示在这里。'}</p>}
   {nextCursor&&<button type="button" className="text-button history-older" disabled={loadingMore||phase==='loading'} onClick={onOlder}>{loadingMore?'正在读取更早记录…':'加载更早记录'}</button>}
   {error&&history.length>0&&<small className="history-list-error" role="alert">{error}</small>}
  </div>
 </section>;
}
