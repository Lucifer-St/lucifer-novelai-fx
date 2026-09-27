import {FeatureError} from './local-store.mjs';
import {publicNetworkMessage} from './public-network-errors.mjs';

const ORIGIN='https://danbooru.donmai.us';
const DEFAULT_LIMIT=12,MAX_BYTES=4*1024*1024;
const RATINGS=new Set(['g','s','q','e','all']);
const SORTS={latest:'id_desc',score:'score',favorites:'favcount'};
const PERIODS={all:null,today:0,week:7,month:30};
async function isQueryTimeout(response){
 try{const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>16384)return false;chunks.push(Buffer.from(chunk));}const detail=JSON.parse(Buffer.concat(chunks).toString('utf8'));return detail.error==='ActiveRecord::QueryCanceled'||detail.message==='The database timed out running your query.';}catch{return false;}
}
export function buildDanbooruQuery(params,now=Date.now()){
 const q=String(params.get('q')||'').trim(),rating=params.get('rating')||'g',sort=params.get('sort')||'latest',period=params.get('period')||'all',page=Number(params.get('page')||1),pageSize=Number(params.get('pageSize')??DEFAULT_LIMIT);
 if(q.length>240||/[\r\n\x00-\x1f]/.test(q))throw new FeatureError('搜索词最多 240 字符，请使用空格分隔标签。');
 if(!RATINGS.has(rating)||!Object.hasOwn(SORTS,sort)||!Object.hasOwn(PERIODS,period)||!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(pageSize)||pageSize<12||pageSize>48)throw new FeatureError('图库筛选参数无效。');
 if(/(?:^|\s)[~-]?(?:rating|order|date|age|limit):/i.test(q))throw new FeatureError('请使用上方的内容等级、排序和时间筛选器，避免搜索条件冲突。');
 const tags=[q,rating==='all'?'':`rating:${rating}`,`order:${SORTS[sort]}`];
 if(period!=='all'){const date=new Date(now);date.setUTCDate(date.getUTCDate()-PERIODS[period]);tags.push(`date:>=${date.toISOString().slice(0,10)}`);}
 const query=tags.filter(Boolean).join(' '),url=new URL('/posts.json',ORIGIN);url.search=new URLSearchParams({tags:query,limit:String(pageSize),page:String(page)}).toString();
 return {q,rating,sort,period,page,pageSize,query,url,sourceUrl:`${ORIGIN}/posts?${new URLSearchParams({tags:query,page:String(page),limit:String(pageSize)})}`};
}
export function danbooruCandidateUrls(search){
 // Exact top-k optimization, not an added user filter. Every excluded row is
 // strictly below this window. A FULL raw page therefore has the same rows and
 // score/fav_count DESC, id DESC order as the original unbounded query. If it is
 // short, widen before returning anything, including a short/empty later page.
 // Upstream reference: danbooru/danbooru app/models/post.rb order_matches.
 // Bound successful expansions to three reads; HTTP/network failures never retry.
 if(search.period!=='all'||!['score','favorites'].includes(search.sort))return [search.url];
 const metric=search.sort==='score'?'score':'favcount';
 // Boolean/optional-tag expressions may bind an appended predicate to only one
 // branch. Leave advanced queries untouched rather than assume their grouping.
 if(new RegExp(`(?:^|\\s)[~-]?${metric}:`,'i').test(search.q)||/[~()|]/.test(search.q)||/(?:^|\s)(?:or|and|not)(?:\s|$)/i.test(search.q))return [search.url];
 return [100,0].map(floor=>{const url=new URL(search.url);url.searchParams.set('tags',`${search.query} ${metric}:>=${floor}`);return url;}).concat(search.url);
}
export function danbooruMediaUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['cdn.donmai.us','danbooru.donmai.us'].includes(u.hostname)?u.href:null;}catch{return null;}
}
export function normalizeDanbooruPost(post){
 if(!Number.isSafeInteger(post?.id)||post.id<1||!['g','s','q','e'].includes(post.rating)||post.is_deleted||post.is_banned)return null;
 const variants=Array.isArray(post.media_asset?.variants)?post.media_asset.variants:[];
 const variant=type=>danbooruMediaUrl(variants.find(v=>v.type===type)?.url);
 const tags={};for(const name of ['artist','character','copyright','general','meta'])tags[name]=[...new Set(String(post[`tag_string_${name}`]||'').split(/\s+/).filter(Boolean))].slice(0,1500);
 return {id:post.id,rating:post.rating,score:Number(post.score)||0,favorites:Number(post.fav_count)||0,width:Number(post.image_width)||0,height:Number(post.image_height)||0,createdAt:post.created_at,
  pageUrl:`${ORIGIN}/posts/${post.id}`,thumbnail:variant('360x360')||danbooruMediaUrl(post.preview_file_url),preview:variant('720x720')||variant('sample')||danbooruMediaUrl(post.large_file_url)||danbooruMediaUrl(post.preview_file_url),
  original:/^(?:jpe?g|png|webp|gif|avif)$/i.test(post.file_ext||'')?(variant('original')||danbooruMediaUrl(post.file_url)):null,
  tags,rawTags:String(post.tag_string||Object.values(tags).flat().join(' ')).slice(0,60000)};
}

// Separate public read-only client: no NovelAI key, gateway, ComfyUI or startup request.
export function createDanbooru({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map(),images=new Map(),queue=[];let lastStarted=-Infinity,activeImages=0,imageBytes=0;
 async function imageSlot(signal){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(activeImages<4){activeImages++;return;}
  if(queue.length>=48)throw new FeatureError('图片读取繁忙，请稍后打开。','danbooru_image_busy',429);
  await new Promise((resolve,reject)=>{const item={resolve:()=>{signal?.removeEventListener('abort',abort);resolve();}};const abort=()=>{const i=queue.indexOf(item);if(i>=0)queue.splice(i,1);reject(new DOMException('Aborted','AbortError'));};signal?.addEventListener('abort',abort,{once:true});queue.push(item);});
 }
 function releaseImage(){const next=queue.shift();if(next)next.resolve();else activeImages--;}
 return {async media(value,signal){
  const url=danbooruMediaUrl(value);
  if(!url||url.length>1600||!/^\/(?:original|sample|180x180|360x360|720x720|data)\/.+\.(?:png|jpe?g|webp|gif|avif)$/i.test(new URL(url).pathname)||new URL(url).search)throw new FeatureError('只允许读取 Danbooru 提供的图片地址。');
  const saved=images.get(url);if(saved&&now()-saved.at<120000)return saved.value;
  await imageSlot(signal);
  try{
   const response=await fetchImpl(url,{method:'GET',headers:{Accept:'image/*','User-Agent':'LuciferNovelAIFX/2.8 (anonymous local reference browser)',Referer:ORIGIN+'/'},credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
   if(!response.ok)throw new FeatureError(`Danbooru 图片暂不可用（HTTP ${response.status}），请在原帖查看。`,'danbooru_image_unavailable',502);
   const type=(response.headers.get('content-type')||'').split(';')[0];if(!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(type))throw new FeatureError('原站未返回图片，可能需要在原站确认访问。','danbooru_image_unavailable',502);
   const max=32*1024*1024;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new FeatureError('原图超过 32 MB，请在原帖查看。','danbooru_image_too_large',502);}
   const parts=[];let bytes=0;for await(const part of response.body){bytes+=part.length;if(bytes>max)throw new FeatureError('原图超过 32 MB，请在原帖查看。','danbooru_image_too_large',502);parts.push(Buffer.from(part));}
   const value={bytes:Buffer.concat(parts),contentType:type};
   if(bytes<=1024*1024&&!new URL(url).pathname.startsWith('/original/')){if(saved){imageBytes-=saved.value.bytes.length;images.delete(url);}images.set(url,{at:now(),value});imageBytes+=bytes;while(images.size>48||imageBytes>16*1024*1024){const first=images.keys().next().value;imageBytes-=images.get(first).value.bytes.length;images.delete(first);}}
   return value;
  }catch(e){if(e instanceof FeatureError)throw e;throw new FeatureError(publicNetworkMessage(e,'Danbooru 图片'),'danbooru_image_connection',502);}finally{releaseImage();}
 },async posts(params){
  const search=buildDanbooruQuery(params,now()),key=search.url.href,saved=cache.get(key);
  if(params.get('refresh')!=='1'&&saved&&now()-saved.at<120000)return {...saved.value,cached:true};
  if(pending.has(key))return pending.get(key);
  if(pending.size>=2||now()-lastStarted<500)throw new FeatureError('操作稍快，请稍后再点搜索。','danbooru_rate_limit',429);
  lastStarted=now();
  const run=(async()=>{
   try{
    let rows;const candidates=danbooruCandidateUrls(search);
    for(const candidate of candidates){
    const response=await fetchImpl(candidate,{method:'GET',headers:{Accept:'application/json','User-Agent':'LuciferNovelAIFX/2.8 (anonymous local reference browser)'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok){const status=response.status;if([500,504].includes(status)&&await isQueryTimeout(response))throw new FeatureError('Danbooru 原站数据库查询超时。不限时间的收藏／评分排序可能范围过大，请缩小上传时间、增加标签，或改按最新排序。','danbooru_query_timeout',504);throw new FeatureError(status===429?'Danbooru 暂时限流，请稍后重试。':status===401||status===403?'Danbooru 限制了当前匿名访问，可在原站查看。':status===422?'搜索条件超出 Danbooru 当前限制，请减少标签或在原站查看。':`Danbooru 返回 HTTP ${status}，可稍后重试或在原站查看。`,'danbooru_upstream',status===429?429:502);}
    if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new FeatureError('图库响应过大，请缩小搜索范围。','danbooru_response_too_large',502);
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw new FeatureError('图库响应过大，请缩小搜索范围。','danbooru_response_too_large',502);chunks.push(Buffer.from(chunk));}
    try{rows=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new FeatureError('Danbooru 没有返回有效的图库数据，可在原站查看。','danbooru_bad_response',502);}
    if(!Array.isArray(rows))throw new FeatureError('Danbooru 没有返回图片列表。','danbooru_bad_response',502);
    if(rows.length>=search.pageSize)break;
    }
    const posts=rows.slice(0,search.pageSize).map(normalizeDanbooruPost).filter(p=>p&&(search.rating==='all'||p.rating===search.rating));
    const value={posts,page:search.page,pageSize:search.pageSize,hasMore:rows.length>=search.pageSize,query:search.query,sourceUrl:search.sourceUrl,ranking:'exact',cached:false};
    cache.set(key,{at:now(),value});while(cache.size>32)cache.delete(cache.keys().next().value);return value;
   }catch(e){if(e instanceof FeatureError)throw e;throw new FeatureError(publicNetworkMessage(e,'Danbooru'),'danbooru_connection',502);}
  })();pending.set(key,run);try{return await run;}finally{pending.delete(key);}
 }};
}
