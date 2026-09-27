import {FeatureError} from './local-store.mjs';
export function artistProfile(platform,value){
 const text=String(value||'').trim();
 if(platform==='pixiv'){const id=text.match(/^\d+$/)?.[0]||text.match(/^https?:\/\/(?:www\.)?pixiv\.net\/(?:[a-z]{2}\/)?users\/(\d+)/)?.[1]||text.match(/^https?:\/\/(?:www\.)?pixiv\.net\/member\.php\?id=(\d+)/)?.[1];if(!id)throw new FeatureError('请输入 Pixiv 用户 ID 或用户主页链接。');return `https://www.pixiv.net/users/${id}`;}
 if(platform==='x'){const user=text.replace(/^@/,'').match(/^[A-Za-z0-9_]{1,15}$/)?.[0]||text.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/|$)/)?.[1];if(!user)throw new FeatureError('请输入 X @账号或主页链接。');return `https://twitter.com/${user}`;}
 throw new FeatureError('请选择 Pixiv 或 X。');
}
export async function lookupArtist(input,fetchImpl=fetch){
 const profile=artistProfile(input.platform,input.value);const query=new URLSearchParams({'search[url_matches]':profile,limit:'20','only':'id,name,other_names,urls,url_string,is_deleted'});const searchUrl='https://danbooru.donmai.us/artists?'+query;
 try{const r=await fetchImpl('https://danbooru.donmai.us/artists.json?'+query,{headers:{'User-Agent':'LuciferNovelAIFX/2.0 (personal artist lookup)'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)return {profile,searchUrl,candidates:[],unavailable:true,message:`Danbooru 返回 HTTP ${r.status}，可在原站查询。`};const data=await r.json();if(!Array.isArray(data))throw Error();return {profile,searchUrl,candidates:data.filter(a=>!a.is_deleted).map(a=>({id:a.id,name:a.name,tag:`artist:${a.name}`,aliases:a.other_names||[],urls:a.urls?.map(x=>x.url)||a.url_string?.split(/\s+/)||[],url:`https://danbooru.donmai.us/artists/${a.id}`,novelaiVerified:false}))};}catch{return {profile,searchUrl,candidates:[],unavailable:true,message:'画师接口暂不可用，可打开 Danbooru 查询；没有进行额外抓取。'};}
}
