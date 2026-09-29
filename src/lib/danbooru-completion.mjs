// Danbooru queries use whitespace-separated tags, not NovelAI comma/weight syntax.
export function danbooruToken(value,start,end=start){
 if(typeof value!=='string'||start!==end||start<0||start>value.length)return null;
 let left=start,right=start;while(left>0&&!/\s/.test(value[left-1]))left--;while(right<value.length&&!/\s/.test(value[right]))right++;
 const raw=value.slice(left,right),prefix=/^[-~]/.test(raw)?raw[0]:'',query=raw.slice(prefix.length);
 if(query.length<2||query.length>100||/[:*"(){}]/.test(query)&&!/^[^: *"{}]+\([^()]*\)?$/.test(query))return null;
 return {value,start:left,end:right,prefix,query};
}
export function completeDanbooruToken(token,tag){
 const inserted=token.prefix+tag.replace(/ /g,'_');
 return {value:token.value.slice(0,token.start)+inserted+token.value.slice(token.end),caret:token.start+inserted.length};
}
