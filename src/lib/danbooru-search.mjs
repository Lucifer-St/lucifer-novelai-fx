// Convert ordinary comma-separated tag lists, preserving advanced query syntax
// and literal commas inside parenthesized tag names.
export function normalizeDanbooruSearch(value){
 const text=String(value||'').trim();
 if(/[:"|{}]/.test(text)||/\b(?:and|or|not)\b/i.test(text))return text;
 let depth=0,result='';
 for(const char of text){if(char==='(')depth++;if(char===')')depth=Math.max(0,depth-1);result+=!depth&&/[,，]/.test(char)?' ':char;}
 return result.replace(/\s+/g,' ').trim();
}
export function danbooruSearchTags({q='',rating='g',sort='latest',period='all'},now=Date.now()){
 // Latest is Danbooru's default. Explicit order:id_desc consumes a tag slot.
 const tags=[normalizeDanbooruSearch(q),rating==='all'?'':`rating:${rating}`,sort==='latest'?'':`order:${{score:'score',favorites:'favcount'}[sort]}`];
 if(period!=='all'){const date=new Date(now);date.setUTCDate(date.getUTCDate()-({today:0,week:7,month:30}[period]));tags.push(`date:>=${date.toISOString().slice(0,10)}`);}
 return tags.filter(Boolean).join(' ');
}
