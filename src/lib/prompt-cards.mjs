export const CARD_CATEGORIES=['画风','角色','场景','服装','其他'];
export function categoryFor(entry){return entry.category||({style:'画风',character:'角色'}[entry.kind])||'其他';}
export function cardType(entry){return entry.kind==='draft'?'draft':entry.kind==='preset'?'preset':entry.kind==='parameters'?'parameters':'snippet';}
export function cardSnapshot(entry,start,end,text){return {instanceId:crypto.randomUUID(),presetId:entry.id,title:entry.title||entry.text?.trim().slice(0,24)||'未命名卡片',category:categoryFor(entry),start,end,text,detached:false};}
export function validCards(cards,text){return (Array.isArray(cards)?cards:[]).filter(c=>c&&typeof c.instanceId==='string').map(c=>{
 const reliable=!c.detached&&Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end<=text.length&&c.end>c.start&&text.slice(c.start,c.end)===c.text;
 return reliable?c:{...c,detached:true};
});}
export function rebaseCards(before,after,cards){
 if(before===after)return validCards(cards,after);
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let oldEnd=before.length,newEnd=after.length;while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 const delta=newEnd-oldEnd;
 return validCards(cards,before).flatMap(card=>{
  if(card.detached)return [card];
  if(oldEnd<=card.start)return [{...card,start:card.start+delta,end:card.end+delta}];
  if(start>=card.end)return [card];
  if(start===card.start&&oldEnd===card.end&&newEnd>start)return [{...card,end:newEnd,text:after.slice(start,newEnd),edited:true}];
  if(start<=card.start&&oldEnd>=card.end)return newEnd===start?[]:[{...card,detached:true}];
  if(start>=card.start&&oldEnd<=card.end){const end=card.end+delta;return end>card.start?[{...card,end,text:after.slice(card.start,end),edited:true}]:[];}
  // An edit spanning a card boundary cannot be attributed safely.
  return [{...card,detached:true}];
 });
}
export function insertCard(before,start,end,entry,cards=[]){
 start=Math.max(0,Math.min(before.length,start));end=Math.max(start,Math.min(before.length,end));
 const text=String(entry.text||''),left=before.slice(0,start),right=before.slice(end);
 const leading=left&&!/[\s,]$/.test(left)?', ':'',trailing=right&&!/^[\s,]/.test(right)?', ':'';
 const inserted=leading+text+trailing,after=left+inserted+right;
 const survivors=cards.filter(c=>c.detached||!(start<end&&c.start>=start&&c.end<=end));
 const others=rebaseCards(before,after,survivors);
 return {text:after,start,end,inserted,cards:[...others,cardSnapshot(entry,start,start+inserted.length,inserted)]};
}
// A known replacement carries intent that a common-prefix diff cannot infer:
// completing the final word inside a card also extends that card's right edge.
export function replaceRangeCards(before,after,cards,start,end){
 const delta=after.length-before.length;
 return validCards(cards,before).flatMap(card=>{
  if(card.detached)return [card];
  if(start>=card.start&&end<=card.end){const nextEnd=card.end+delta;return nextEnd>card.start?[{...card,end:nextEnd,text:after.slice(card.start,nextEnd),edited:true}]:[];}
  if(end<=card.start)return [{...card,start:card.start+delta,end:card.end+delta}];
  if(start>=card.end)return [card];
  if(start<=card.start&&end>=card.end)return [];
  return [{...card,detached:true}];
 });
}
export function removeCard(text,cards,id){
 const normalized=validCards(cards,text),target=normalized.find(c=>c.instanceId===id),remaining=normalized.filter(c=>c.instanceId!==id);
 if(!target||target.detached)return {text,cards:remaining,detached:true};
 const after=text.slice(0,target.start)+text.slice(target.end);
 return {text:after,cards:rebaseCards(text,after,remaining),start:target.start,end:target.end,inserted:'',detached:false};
}
