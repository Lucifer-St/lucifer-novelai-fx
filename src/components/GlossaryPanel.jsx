import {useEffect,useState} from 'react';
import {normalizeTag} from '../lib/tag-suggestions.mjs';
import {readPersonalGlossary,savePersonalGlossary,meaning,glossaryTerms} from '../lib/tag-glossary.mjs';
import {copyText,openExternal} from '../lib/platform.mjs';
export default function GlossaryPanel({text}){
 const [words,setWords]=useState({}),[overrides,setOverrides]=useState(readPersonalGlossary),[en,setEn]=useState(''),[zh,setZh]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;fetch('/glossary/zh-cn.json').then(r=>r.json()).then(data=>{if(live)setWords(glossaryTerms(data));}).catch(()=>setMessage('词典暂时不可用，可使用外部翻译网页。'));return()=>{live=false;};},[]);
 const tokens=[...new Set(text.replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)::|::|[{}\[\]]/g,'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean))];
 function save(next){setOverrides(savePersonalGlossary(next));}
 return <div className="share-glossary"><p>中文只供阅读；不会替换实际 Prompt。未收录的词、画师和角色名保留原文。</p><div className="glossary-source">{text||'先在提示词中输入或选中文字。'}</div><div className="glossary-terms">{tokens.map(tag=><div key={tag}><code>{tag}</code><span>{meaning(overrides,normalizeTag(tag))||meaning(words,normalizeTag(tag))||'未收录'}</span><button onClick={()=>{setEn(normalizeTag(tag));setZh(meaning(overrides,normalizeTag(tag))||meaning(words,normalizeTag(tag))||'');}}>编辑释义</button></div>)}</div>
 <button disabled={!text} onClick={async()=>{try{await copyText(text);await openExternal('https://fanyi.baidu.com');setMessage('已复制原文并打开百度翻译，请在网页粘贴。');}catch{setMessage('复制被系统阻止，请手动复制上方原文，再打开翻译网页。');}}}>复制并打开百度翻译</button> <a href="https://fanyi.baidu.com" target="_blank" rel="noreferrer">打开翻译网页 ↗</a>
 <h3>我的词条</h3><div className="glossary-edit"><label>英文标签<input aria-label="词条英文" value={en} onChange={e=>setEn(e.target.value)}/></label><label>中文释义<input aria-label="词条中文" value={zh} onChange={e=>setZh(e.target.value)}/></label><button disabled={!en.trim()||!zh.trim()} onClick={()=>{try{if(['__proto__','constructor','prototype'].includes(normalizeTag(en)))throw Error('此词条名称保留，不能保存');if(en.length>150||zh.length>300)throw Error('词条过长');save({...overrides,[normalizeTag(en)]:zh.trim()});setMessage('个人释义已保存。');}catch(e){setMessage(e.message);}}}>保存释义</button></div>
 <label>导入中文词典 JSON<input type="file" accept=".json,application/json" aria-label="导入中文词典" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>4*1024*1024)throw Error('词典超过 4 MiB');const parsed=JSON.parse(await file.text()),terms=parsed?.terms||parsed;if(!terms||typeof terms!=='object'||Array.isArray(terms))throw Error('词条格式无效');save({...overrides,...terms});setMessage('个人词典已合并。');}catch(err){setMessage(err.message);}}}/></label><p role="status">{message}</p></div>;
}
