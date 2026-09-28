export const APPEARANCE_KEY = 'lucifer-fx-appearance-v1';
export const LOADING_SKINS = Object.freeze([
  {id:'claire-noire',name:'Claire & Noire',subtitle:'双生祈愿',title:'少女祈愿中',image:'/assets/loading/claire-noire.png',accent:'#c9b6ef'},
  {id:'teresa',name:'特蕾莎',subtitle:'绯色祈愿',title:'少女祈愿中',image:'/assets/loading/teresa.png',accent:'#dea0b5'},
  {id:'lily-violin',name:'Lily',subtitle:'小提琴独奏',title:'少女演奏中',image:'/assets/loading/lily-violin.png',accent:'#f3c98e'},
  {id:'sugar-lily',name:'Sugar & Lily',subtitle:'并肩等待',title:'少女祈愿中',image:'/assets/loading/sugar-lily.png',accent:'#b8ddec'},
  {id:'rose-lime',name:'Rose & Lime',subtitle:'双骑士的祈愿',title:'少女祈愿中',image:'/assets/loading/rose-lime.png',accent:'#d6c49b'},
  {id:'lemmtear',name:'Lemmtear',subtitle:'青色心愿',title:'少女祈愿中',image:'/assets/loading/lemmtear.png',accent:'#8bdfd5'},
  {id:'symphonic-rehearsal',name:'Lily & Sugar',subtitle:'少女排练中',title:'少女排练中',image:'/assets/loading/symphonic-rehearsal.png',accent:'#a5d5eb',layout:'scene',width:1672,height:941},
  {id:'elixir-maintenance',name:'Rose & Lime',subtitle:'少女整备中',title:'少女整备中',image:'/assets/loading/elixir-maintenance.png',accent:'#e4baca',layout:'scene',width:1672,height:941},
  {id:'lemmtear-reading',name:'Lemmtear',subtitle:'少女夜读中',title:'少女夜读中',image:'/assets/loading/lemmtear-reading.png',accent:'#86d4cb',layout:'portrait',width:1086,height:1448},
  {id:'classic',name:'简洁黑卡',subtitle:'仅显示等待状态',title:'正在绘制新的画面',image:null,accent:'#a9c4ed'},
]);
const byId = new Map(LOADING_SKINS.map(s=>[s.id,s]));
export const RANDOM_LOADING_SKIN = Object.freeze({id:'random',name:'随机切换',subtitle:'每次生成换一张'});
const illustratedIds=LOADING_SKINS.filter(s=>s.image).map(s=>s.id);
export const LOADING_ILLUSTRATED_COUNT=illustratedIds.length;
/** Draw only at submission. A request retains this result for its entire life. */
export function resolveLoadingSkin(id,previousId='',random=Math.random){
 if(id!=='random')return getLoadingSkin(id).id;
 const candidates=illustratedIds.filter(candidate=>candidate!==previousId);
 const value=Number(random());
 const unit=Number.isFinite(value)?Math.max(0,Math.min(1-Number.EPSILON,value)):0;
 return candidates[Math.floor(unit*candidates.length)];
}
export const WORKBENCH_SKINS = Object.freeze([
 {id:'exstia',name:'ExS-TiA',subtitle:'光之翼 · 蓝白光轨'},
 {id:'exstia-chevalier',name:'ExS-TiA Chevalier',subtitle:'王家之剑 · 绯色羽翼'},
 {id:'exstia-magica',name:'ExS-TiA Magica',subtitle:'四机翼阵 · 紫夜微光'},
 {id:'classic',name:'经典版',subtitle:'清透蓝白 · 专注创作'},
 {id:'teresa',name:'Teresa · 特蕾莎',subtitle:'暖纸私笺 · 皇冠蜡封'},
 {id:'book-contract',name:'Sacred Lineage',subtitle:'双生书契 · Claire 书签'},
 {id:'symphonic',name:'Symphonic',subtitle:'Lily & Sugar · 薄荷协奏'},
 {id:'elixir',name:'Elixir',subtitle:'Rose & Lime · 骑士装帧'},
 {id:'lemmtear',name:'Lemmtear',subtitle:'青红装甲 · 夜间创作'},
 {id:'precure-scrapbook',name:'找出‘真实’的答案',subtitle:'Arcana Shadow & Eclair · 双页拼贴'},
 {id:'precure-days',name:'名探偵の道も一歩から',subtitle:'るるか & くれあ · 日常相册'},
]);
export const CHARACTER_UI_SKINS=Object.freeze(['teresa','book-contract','symphonic']);
export const DEFAULT_APPEARANCE = Object.freeze({version:1,workbenchSkin:'classic',loadingSkin:'claire-noire',motion:'system',characterDecorations:true});
export function getLoadingSkin(id){return byId.get(id)||byId.get(DEFAULT_APPEARANCE.loadingSkin);}
export function normalizeAppearance(input){
 return {version:1,workbenchSkin:WORKBENCH_SKINS.some(s=>s.id===input?.workbenchSkin)?input.workbenchSkin:'classic',loadingSkin:input?.loadingSkin==='random'||byId.has(input?.loadingSkin)?input.loadingSkin:DEFAULT_APPEARANCE.loadingSkin,motion:input?.motion==='off'?'off':'system',characterDecorations:input?.characterDecorations!==false};
}
export function readAppearance(storage){
 try{return normalizeAppearance(JSON.parse(storage.getItem(APPEARANCE_KEY)||'null'));}catch{return {...DEFAULT_APPEARANCE};}
}
export function formatElapsed(seconds){
 const total=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
 return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
