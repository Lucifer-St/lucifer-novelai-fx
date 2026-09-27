export function adjustPromptWeight(text,start,end,direction,step=.05){
 text=String(text);start=Math.max(0,Math.min(text.length,start));end=Math.max(start,Math.min(text.length,end));
 const delta=direction*step;let active=null;
 for(const m of text.matchAll(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))::|::/g)){
  if(m.index>start)break;
  if(m[1]!==undefined)active={start:m.index,end:m.index+m[1].length,value:Number(m[1]),contentStart:m.index+m[0].length};else active=null;
 }
 if(active){const next=Math.round((active.value+delta)*1000)/1000;const replacement=String(Object.is(next,-0)?0:next);const changed=text.slice(0,active.start)+replacement+text.slice(active.end);const shift=replacement.length-(active.end-active.start);return {text:changed,start:start+shift,end:end+shift};}
 if(start===end)return null;
 const prefix=`${Math.round((1+delta)*1000)/1000}::`,suffix='::';return {text:text.slice(0,start)+prefix+text.slice(start,end)+suffix+text.slice(end),start:start+prefix.length,end:end+prefix.length};
}
