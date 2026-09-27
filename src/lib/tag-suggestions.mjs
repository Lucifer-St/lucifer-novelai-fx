export const TAG_MODE_KEY='lucifer-tag-suggestions-v1';
export const TAG_SOURCE_KEY='lucifer-tag-suggestion-source-v1';
export const TAG_CATEGORIES={0:'通用',1:'画师',3:'作品',4:'角色',5:'元信息'};
export const normalizeTag=text=>String(text).toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();

// Commas, lines and NovelAI weight controls bound the replacement. Colons in
// artist: and parentheses in real character tags remain literal tag content.
export function tagAtCaret(text,start,end=start){
  if(typeof text!=='string'||start!==end||start<0||start>text.length)return null;
  const pattern=/[,+]?([+-]?(?:\d+(?:\.\d*)?|\.\d+))::|::|[,\n\r|{}\[\]]/g;
  let left=0,right=text.length;
  for(const m of text.matchAll(pattern)){const a=m.index,b=a+m[0].length;if(start>a&&start<b)return null;if(b<=start)left=b;else if(a>=start){right=a;break;}}
  while(left<right&&/\s/.test(text[left]))left++;
  while(right>left&&/\s/.test(text[right-1]))right--;
  const query=text.slice(left,right),search=query.replace(/^artist\s*:\s*/i,'').trim();
  if(start<left||start>right||search.length<2||query.length>100||/^[+\-\d.]+$/.test(search)||/https?:|data:|[<>]/i.test(query))return null;
  return {query,start:left,end:right,value:text};
}
export function suggestionText(candidate,query=''){
  const name=String(candidate.tag||'').replace(/_/g,' ').trim();
  return (candidate.category===1||/^artist\s*:/i.test(query))&&!/^artist\s*:/i.test(name)?'artist:'+name:name;
}
export function normalizeOfficialTags(data){
  return (Array.isArray(data?.tags)?data.tags:[]).filter(x=>x&&typeof x.tag==='string'&&x.tag.length<=200&&!/[\n\r]/.test(x.tag)).slice(0,30).map(x=>({tag:x.tag,source:'official',confidence:typeof x.confidence==='number'&&Number.isFinite(x.confidence)?Math.max(0,Math.min(1,x.confidence)):null,category:Number.isInteger(x.category)?x.category:null}));
}
export function mergeSuggestions(official,local,query,limit=8){
  const seen=new Set(),result=[];
  for(const item of [...official,...local]){const key=normalizeTag(suggestionText(item,query));if(!key||seen.has(key))continue;seen.add(key);result.push(item);if(result.length>=limit)break;}return result;
}
export function createLocalTagIndex(rows){return rows.map(([tag,category,count,aliases])=>({tag,category,count:Number(count)||0,name:normalizeTag(tag),aliases:String(aliases||'').split(',').filter(Boolean).map(normalizeTag)}));}
export function searchLocalTags(index,raw,limit=12){
  const artists=/^artist\s*:/i.test(raw),query=normalizeTag(raw.replace(/^artist\s*:\s*/i,''));if(query.length<2||query.length>100)return [];
  const words=query.split(' '),ranked=[];
  for(const item of index){if(artists&&item.category!==1)continue;let score=item.name===query?0:item.name.startsWith(query)?1:Infinity,alias='';
    if(score>1){const match=item.aliases.find(a=>a===query||a.startsWith(query));if(match){score=2;alias=match;}else if(words.every(w=>item.name.includes(w)))score=3;}
    if(score===Infinity)continue;ranked.push({item,score,alias});
  }
  ranked.sort((a,b)=>a.score-b.score||b.item.count-a.item.count||a.item.name.localeCompare(b.item.name));
  return ranked.slice(0,limit).map(({item,alias})=>({tag:item.tag,category:item.category,source:'local',alias:alias||null}));
}

// Keep the large English index stable. Glossary edits replace only the small
// reverse lookup and do not rescan or reload Danbooru's bundled rows.
export function createTagSearchIndex(rows,bundled={},personal={}){
  const tags=createLocalTagIndex(rows);
  const byName=new Map(tags.map(item=>[item.name,item]));
  return updateTagGlossary({tags,byName},bundled,personal);
}

export function updateTagGlossary(index,bundled={},personal={}){
  const entries=[];
  const add=(terms,source)=>{
    if(!terms||typeof terms!=='object'||Array.isArray(terms))return;
    for(const [raw,rawMeaning] of Object.entries(terms)){
      const name=normalizeTag(raw),zh=String(rawMeaning||'').trim();
      if(!name||name.length>150||!zh||zh.length>300||['__proto__','constructor','prototype'].includes(name))continue;
      entries.push({name,zh,source,item:index.byName.get(name)});
    }
  };
  add(bundled,'bundled');add(personal,'personal');
  // Personal meanings override bundled meanings for the same English tag.
  const unique=new Map(entries.map(entry=>[entry.name,entry]));
  return {...index,glossary:[...unique.values()],byGlossary:unique};
}

export function searchTagIndex(index,raw,limit=12){
  const query=normalizeTag(raw.replace(/^artist\s*:\s*/i,''));
  if(query.length<2||query.length>100)return [];
  const chinese=/[\p{Script=Han}]/u.test(query),ranked=[];
  if(chinese){
    for(const entry of index.glossary||[]){
      const meaning=entry.zh.toLowerCase();
      const score=meaning===query?(entry.source==='personal'?0:1):meaning.startsWith(query)?2:Infinity;
      if(score===Infinity)continue;
      ranked.push({score,entry});
    }
    ranked.sort((a,b)=>a.score-b.score||(b.entry.item?.count||0)-(a.entry.item?.count||0)||a.entry.name.localeCompare(b.entry.name));
    return ranked.slice(0,limit).map(({entry})=>({tag:entry.item?.tag||entry.name.replace(/ /g,'_'),category:entry.item?.category??null,source:entry.source,zh:entry.zh,glossaryOnly:!entry.item}));
  }
  return searchLocalTags(index.tags,raw,limit).map(item=>{
    const entry=index.byGlossary?.get(normalizeTag(item.tag));
    return {...item,zh:entry?.zh||'',meaningSource:entry?.source||null};
  });
}
