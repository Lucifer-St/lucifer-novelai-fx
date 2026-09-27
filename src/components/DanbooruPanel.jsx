import {copyText} from '../lib/platform.mjs';
import {useEffect,useRef,useState} from 'react';
import {Search,ExternalLink,Copy,Bookmark,ChevronLeft,ChevronRight,X,Image as ImageIcon,Star} from 'lucide-react';
import {DANBOORU_PREFS,DANBOORU_RATINGS,DANBOORU_GROUPS,initialDanbooruPreferences,initialTagSelection,danbooruTagKey,selectedDanbooruTags,danbooruImageUrl,danbooruPageSize,parseDanbooruPage} from '../lib/danbooru.mjs';
import '../danbooru.css';
import DanbooruImageViewer from './DanbooruImageViewer';
import {createThumbnailQueue} from '../lib/thumbnail-queue.mjs';
import useDanbooruImage from '../hooks/useDanbooruImage';

function Preview({src,alt,active,revision,...props}){
 const {image,failed}=useDanbooruImage(src,{active,revision}),[decodeFailed,setDecodeFailed]=useState(false);
 useEffect(()=>setDecodeFailed(false),[image]);
 return image&&!failed&&!decodeFailed?<img src={image} alt={alt} referrerPolicy="no-referrer" onError={()=>setDecodeFailed(true)} {...props}/>:<span className="danbooru-no-image"><ImageIcon size={24}/>{failed||decodeFailed||!src?'图片暂不可用':'正在读取预览…'}</span>;
}
function Thumbnail({src,alt,queue,revision,active}){
 const container=useRef(null),[visible,setVisible]=useState(false),[decodeFailed,setDecodeFailed]=useState(false);
 const {image,failed}=useDanbooruImage(src,{active:active&&visible,queue,revision});
 useEffect(()=>setDecodeFailed(false),[image]);
 useEffect(()=>{if(!('IntersectionObserver' in window)){setVisible(true);return;}const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'0px',threshold:0.01});observer.observe(container.current);return()=>observer.disconnect();},[]);
 return <span className="danbooru-lazy-preview" ref={container}>{!src||failed||decodeFailed?<span className="danbooru-no-image"><ImageIcon size={20}/>图片暂不可用</span>:image?<img src={image} alt={alt} decoding="async" onError={()=>setDecodeFailed(true)}/>:<span className="danbooru-thumbnail-placeholder" aria-hidden="true"><ImageIcon size={20}/></span>}</span>;
}
function originalUrl(params,pageSize){const tags=[params.q,params.rating==='all'?'':`rating:${params.rating}`,`order:${{latest:'id_desc',score:'score',favorites:'favcount'}[params.sort]}`].filter(Boolean);if(params.period!=='all'){const d=new Date();d.setUTCDate(d.getUTCDate()-({today:0,week:7,month:30}[params.period]));tags.push(`date:>=${d.toISOString().slice(0,10)}`);}return 'https://danbooru.donmai.us/posts?'+new URLSearchParams({tags:tags.join(' '),page:String(params.page),limit:String(pageSize||12)});}

export default function DanbooruPanel({onCollect,active=true,refreshRevision=0}){
 const [params,setParams]=useState(()=>initialDanbooruPreferences(localStorage)),[query,setQuery]=useState(params.q),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState(null),[selection,setSelection]=useState(new Set()),[novelai,setNovelai]=useState(true),[notice,setNotice]=useState(''),[tagFilter,setTagFilter]=useState('');
 const [viewImage,setViewImage]=useState(null),[errorCode,setErrorCode]=useState('');
 const [imageRevision,setImageRevision]=useState(0);
 const [manualCopy,setManualCopy]=useState(null),[retryRevision,setRetryRevision]=useState(0);
 const [pageInput,setPageInput]=useState(String(params.page)),[pageError,setPageError]=useState('');
 const completed=useRef(null),refreshSeen=useRef('0:0'),forcePending=useRef(false);
 useEffect(()=>{setPageInput(String(params.page));setPageError('');},[params.page]);
 const outputRef=useRef(null),pageCache=useRef(new Map()),layoutRef=useRef(null),resultsRef=useRef(null);
 const [pageSize,setPageSize]=useState(0);
 function measurePageSize(){const layout=layoutRef.current,results=resultsRef.current;if(!layout||!results)return 0;const style=getComputedStyle(layout),resultStyle=getComputedStyle(results),width=layout.clientWidth-(results.offsetWidth-results.clientWidth)-parseFloat(resultStyle.paddingLeft)-parseFloat(resultStyle.paddingRight);return danbooruPageSize(width,{columns:parseInt(style.getPropertyValue('--danbooru-columns'))||0,minTile:parseFloat(style.getPropertyValue('--danbooru-min-tile'))||145,gap:parseFloat(style.getPropertyValue('--danbooru-gap'))||12});}
 useEffect(()=>{let done=false;const measure=()=>{const size=measurePageSize();if(!done&&size){done=true;setPageSize(size);observer.disconnect();}};const observer=new ResizeObserver(measure);observer.observe(layoutRef.current);measure();return()=>observer.disconnect();},[]);
 const thumbnailQueue=useRef(null);if(!thumbnailQueue.current)thumbnailQueue.current=createThumbnailQueue(4);
 useEffect(()=>{
  if(!active||!pageSize)return;
  const key=new URLSearchParams({...params,pageSize}).toString(),revision=refreshRevision+':'+retryRevision;
  if(completed.current?.key===key&&completed.current?.revision===revision)return;
  if(refreshSeen.current!==revision){refreshSeen.current=revision;forcePending.current=true;}
  const force=forcePending.current,preserve=completed.current?.key===key;
  if(force)pageCache.current.delete(key);
  const controller=new AbortController();setLoading(true);setError('');setErrorCode('');
  if(!preserve){setData(null);setSelected(null);setNotice('');}
  try{localStorage.setItem(DANBOORU_PREFS,JSON.stringify({version:1,...params,page:1}));}catch{}
  const cached=pageCache.current.get(key);
  if(!force&&cached&&Date.now()-cached.at<120000){setData({...cached.value,cached:true});setLoading(false);completed.current={key,revision};return()=>controller.abort();}
  (async()=>{try{
   const response=await fetch('/api/danbooru/posts?'+key+(force?'&refresh=1':''),{signal:controller.signal});const result=await response.json();
   if(!response.ok)throw Object.assign(Error(result.error?.message||'图库暂时不可用。'),{code:result.error?.code});
   if(!controller.signal.aborted){pageCache.current.set(key,{at:Date.now(),value:result});while(pageCache.current.size>32)pageCache.current.delete(pageCache.current.keys().next().value);setData(result);if(preserve)setSelected(previous=>previous?result.posts.find(post=>post.id===previous.id)||null:null);}
  }catch(e){if(!controller.signal.aborted){setError(e instanceof TypeError?'无法连接应用本机服务。请确认应用仍在运行，再手动重试。':e.message);setErrorCode(e.code||'');}}
  finally{if(!controller.signal.aborted){setLoading(false);completed.current={key,revision};forcePending.current=false;}}})();
  return()=>controller.abort();
 },[params,pageSize,active,refreshRevision,retryRevision]);
 function jumpPage(event){event.preventDefault();const page=parseDanbooruPage(pageInput);if(page===null){setPageError('请输入 1–1000 之间的整数页码。');return;}setPageError('');setPageInput(String(page));setParams(previous=>previous.page===page?previous:{...previous,page});}
 function search(patch={}){setPageSize(measurePageSize()||pageSize);setParams(p=>({...p,q:query.trim(),page:1,...patch}));}
 function open(post){setSelected(post);setSelection(initialTagSelection(post));setTagFilter('');setNotice('');}
 function toggle(group,tag){const key=danbooruTagKey(group,tag);setSelection(old=>{const next=new Set(old);next.has(key)?next.delete(key):next.add(key);return next;});setNotice('');}
 function groupSelection(group,on){setSelection(old=>{const next=new Set(old);for(const tag of selected.tags[group]||[]){const key=danbooruTagKey(group,tag);on?next.add(key):next.delete(key);}return next;});setNotice('');}
 const text=selected?selectedDanbooruTags(selected,selection,novelai):'';
 useEffect(()=>setManualCopy(null),[text,selected]);
 async function copy(value){try{await copyText(value);setNotice('已复制到剪贴板。');}catch{setManualCopy(value);setNotice('剪贴板不可用，已选中待复制文本，请按 Ctrl+C。');requestAnimationFrame(()=>{outputRef.current?.focus();outputRef.current?.select();});}}
 return <div className={`danbooru-workspace${selected?' has-selection':''}`}>
  <div className="danbooru-heading"><div><p className="danbooru-eyebrow">DANBOORU / REFERENCE LIBRARY</p><h3>看图，挑选灵感与标签。</h3></div><a className="button" href={data?.sourceUrl||originalUrl(params,pageSize)} target="_blank" rel="noreferrer"><ExternalLink size={14}/>在原站打开</a></div>
  <form className="danbooru-filters" onSubmit={e=>{e.preventDefault();search();}}>
   <label className="danbooru-search"><span>搜索标签</span><div><Search size={16}/><input aria-label="Danbooru 搜索标签" placeholder="例如 landscape、blue_hair；空格分隔标签" value={query} maxLength={240} onChange={e=>setQuery(e.target.value)}/><button className="primary" type="submit">搜索</button></div></label>
   <label>排序<select aria-label="Danbooru 排序" value={params.sort} onChange={e=>search({sort:e.target.value})}><option value="latest">最新上传</option><option value="score">热门 · 评分最高</option><option value="favorites">收藏最多</option></select></label>
   <label>上传时间<select aria-label="Danbooru 上传时间" value={params.period} onChange={e=>search({period:e.target.value})}><option value="all">不限时间</option><option value="today">今天</option><option value="week">最近 7 天</option><option value="month">最近 30 天</option></select></label>
   <label>内容等级<select aria-label="Danbooru 内容等级" value={params.rating} onChange={e=>search({rating:e.target.value})}>{Object.entries(DANBOORU_RATINGS).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
  </form>
  <div className="danbooru-query-info"><span>{pageSize?`每页 ${pageSize} 张`:'按整行分页'} · 滚动时加载缩略图 · 时间按 UTC；等级采用原站标记。</span><span>公开只读检索 · 不经过生图网关 <button disabled={loading||!data?.posts?.length} onClick={()=>setImageRevision(v=>v+1)}>重新加载图片</button></span></div>
  <div className="danbooru-body" ref={layoutRef}>
   <section ref={resultsRef} data-danbooru-scroll className="danbooru-results" aria-label="Danbooru 图片列表" aria-busy={loading}>
    {loading?<div className="danbooru-empty" role="status"><span className="danbooru-spinner"/>正在读取图库…</div>:error?<div className="danbooru-empty" role="alert"><p>{error}</p>{errorCode==='danbooru_query_timeout'&&<div className="danbooru-recovery-actions">{['all','month'].includes(params.period)&&<button onClick={()=>search({period:'week'})}>改查最近 7 天</button>}{params.sort!=='latest'&&<button onClick={()=>search({sort:'latest'})}>改按最新排序</button>}</div>}<button onClick={()=>setRetryRevision(value=>value+1)}>重试检索</button><a href={originalUrl(params,pageSize)} target="_blank" rel="noreferrer">在原站查看</a></div>:<>
     {!data?.posts?.length&&<div className="danbooru-empty"><ImageIcon size={30}/><p>没有匹配的图片。试试减少标签，或调整等级与时间。</p></div>}
     <div className="danbooru-grid">{data?.posts.map(post=><button key={post.id} className={`danbooru-tile${selected?.id===post.id?' selected':''}`} aria-label={`查看图片 #${post.id}`} onClick={()=>open(post)}>
      <div className="danbooru-thumbnail"><Thumbnail src={post.thumbnail} alt={`Danbooru #${post.id}`} queue={thumbnailQueue.current} revision={imageRevision} active={active}/><span className={`danbooru-rating rating-${post.rating}`}>{post.rating.toUpperCase()}</span></div><div className="danbooru-tile-caption"><span>#{post.id}</span><span><Star size={11}/>{post.score}<Bookmark size={11}/>{post.favorites}</span></div>
     </button>)}</div>
    </>}
    <nav className="danbooru-pagination" aria-label="图库分页"><button disabled={loading||params.page<=1} onClick={()=>setParams(p=>({...p,page:p.page-1}))}><ChevronLeft size={14}/>上一页</button><span>第 {params.page} 页{data?` · ${data.posts.length} 张`:''}</span><button disabled={loading||!data?.hasMore||params.page>=1000} onClick={()=>setParams(p=>({...p,page:p.page+1}))}>下一页<ChevronRight size={14}/></button><form className="danbooru-page-jump" onSubmit={jumpPage} noValidate><label><span>跳至</span><input aria-label="跳转页码" inputMode="numeric" autoComplete="off" maxLength={10} value={pageInput} aria-invalid={!!pageError} aria-describedby={pageError?'danbooru-page-error':undefined} onChange={event=>{setPageInput(event.target.value);setPageError('');}}/><span>页</span></label><button type="submit" disabled={loading}>跳转</button></form>{pageError&&<p id="danbooru-page-error" className="danbooru-page-error" role="alert">{pageError}</p>}</nav>
   </section>
   {selected&&<aside data-danbooru-scroll className="danbooru-detail" aria-label="图片详情">
    <header><strong>#{selected.id} <small>{DANBOORU_RATINGS[selected.rating]}</small></strong><button aria-label="返回图库列表" onClick={()=>setSelected(null)}><X size={17}/></button></header>
    <button className="danbooru-large-preview" disabled={!selected.original&&!selected.preview&&!selected.thumbnail} aria-label={`放大查看图片 #${selected.id}`} onClick={()=>setViewImage(selected)} title="点击查看大图，支持缩放和拖拽"><Preview active={active} revision={imageRevision} src={selected.preview||selected.thumbnail} alt={`预览 #${selected.id}`}/><span className="danbooru-enlarge-hint">点击放大 · 查看原图</span></button>
    <div className="danbooru-post-info"><span>{selected.width} × {selected.height} · 评分 {selected.score} · 收藏 {selected.favorites}</span><a href={selected.pageUrl} target="_blank" rel="noreferrer">原帖 <ExternalLink size={11}/></a></div>
    <div className="danbooru-tag-toolbar"><strong>选择要复制的标签</strong><button onClick={()=>setSelection(new Set(DANBOORU_GROUPS.flatMap(([g])=>(selected.tags[g]||[]).map(t=>danbooruTagKey(g,t)))))}>全选</button><button onClick={()=>setSelection(new Set())}>清空</button></div>
    <input className="danbooru-tag-filter" aria-label="筛选当前图片标签" placeholder="在本图标签中筛选…" value={tagFilter} onChange={e=>setTagFilter(e.target.value)}/>
    <div data-danbooru-scroll className="danbooru-tag-groups">{DANBOORU_GROUPS.map(([group,label])=>{const tags=selected.tags[group]||[],visible=tags.filter(t=>t.replace(/_/g,' ').toLowerCase().includes(tagFilter.replace(/_/g,' ').toLowerCase()));if(!tags.length)return null;const count=tags.filter(t=>selection.has(danbooruTagKey(group,t))).length;return <section key={group} className={'danbooru-tag-group group-'+group} aria-label={`${label}标签`}><div><strong>{label} <small>{count}/{tags.length}</small></strong><button onClick={()=>groupSelection(group,count!==tags.length)}>{count===tags.length?'取消整组':'选择整组'}</button></div><div className="danbooru-tag-chips">{visible.map(tag=><button key={tag} aria-pressed={selection.has(danbooruTagKey(group,tag))} title={tag} onClick={()=>toggle(group,tag)}>{tag.replace(/_/g,' ')}</button>)}{!visible.length&&<small>本组无匹配标签</small>}</div></section>;})}</div>
    <label className="danbooru-format"><input type="checkbox" checked={novelai} onChange={e=>setNovelai(e.target.checked)}/>NovelAI 格式：下划线转空格，画师加 artist:</label>
    <textarea ref={outputRef} aria-label="待复制标签" readOnly value={manualCopy??text} rows={3}/>
    <div className="danbooru-copy-actions"><button className="primary" disabled={!text} onClick={()=>copy(text)}><Copy size={14}/>复制所选标签</button><button disabled={!text} onClick={()=>onCollect({kind:'favorite',title:`Danbooru #${selected.id}`,category:'其他',text,notes:`来自 Danbooru #${selected.id}；评级 ${selected.rating.toUpperCase()}。标签由原站提供，未验证 NovelAI 效果。`,sourceUrl:selected.pageUrl,cover:'',payload:null})}><Bookmark size={14}/>存为卡片</button><button disabled={!selected.rawTags} onClick={()=>copy(selected.rawTags)}>复制全部原始 Tag</button></div>
    {notice&&<p className="danbooru-copy-notice" role="status">{notice}</p>}
   </aside>}
  </div>
  {viewImage&&<DanbooruImageViewer active={active} post={viewImage} onClose={()=>setViewImage(null)}/>}
 </div>;
}
