export const DANBOORU_PREFS='lucifer-danbooru-v1';
export const DANBOORU_RATINGS={g:'G · 一般',s:'S · 敏感',q:'Q · 限制级',e:'E · 露骨',all:'全部等级'};
export const DANBOORU_GROUPS=[['artist','画师'],['character','角色'],['copyright','作品'],['general','通用'],['meta','元信息']];
export const DANBOORU_DEFAULTS={q:'',rating:'g',sort:'latest',period:'all',page:1};
export function parseDanbooruPage(value){const text=String(value).trim();if(!/^\d+$/.test(text))return null;const page=Number(text);return Number.isInteger(page)&&page>=1&&page<=1000?page:null;}
export function danbooruPageSize(width,{columns=0,minTile=145,gap=12}={}){
 if(!Number.isFinite(width)||width<=0)return 0;
 const count=Math.min(24,Math.max(1,columns||Math.floor((width+gap)/(minTile+gap))));
 return count*Math.max(2,Math.ceil(12/count));
}
export const danbooruImageUrl=url=>url?'/api/danbooru/image?'+new URLSearchParams({url}):'';
export function initialDanbooruPreferences(storage){try{const p=JSON.parse(storage.getItem(DANBOORU_PREFS));return {...DANBOORU_DEFAULTS,q:typeof p?.q==='string'?p.q.slice(0,240):'',rating:Object.hasOwn(DANBOORU_RATINGS,p?.rating)?p.rating:'g',sort:['latest','score','favorites'].includes(p?.sort)?p.sort:'latest',period:['all','today','week','month'].includes(p?.period)?p.period:'all'};}catch{return {...DANBOORU_DEFAULTS};}}
export function danbooruTagKey(group,tag){return group+'\0'+tag;}
export function initialTagSelection(post){return new Set(DANBOORU_GROUPS.filter(([g])=>g!=='meta').flatMap(([g])=>(post.tags[g]||[]).map(t=>danbooruTagKey(g,t))));}
export function selectedDanbooruTags(post,selection,novelai=true){return [...new Set(DANBOORU_GROUPS.flatMap(([g])=>(post.tags[g]||[]).filter(t=>selection.has(danbooruTagKey(g,t))).map(t=>novelai?(g==='artist'?'artist:':'')+t.replace(/_/g,' '):t)))].join(', ');}
