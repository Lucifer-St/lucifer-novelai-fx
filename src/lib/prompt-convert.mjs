// Deterministic SD/A1111/Comfy-style attention conversion. No model call needed.
export function convertPrompt(input,format='sd'){
 const warnings=[];let source=String(input||''),negative='';
 if(format==='comfy'){
  try{const data=JSON.parse(source);if(typeof data.positive==='string'){negative=data.negative||'';source=data.positive;}else if(typeof data.prompt==='string'){negative=data.negative_prompt||data.negative||'';source=data.prompt;}else{warnings.push('工作流包含多个文本节点，无法可靠判断正负面，请粘贴具体提示词。');return {positive:'',negative:'',warnings,source:input};}}catch{warnings.push('输入不是简单的 Comfy 提示词 JSON，将按文本解析。');}
 }
 const negativeAt=source.indexOf('\nNegative prompt:');
 if(negativeAt>=0){negative=source.slice(negativeAt+17).replace(/\nSteps:\s*\d+[\s\S]*$/,'').trim();source=source.slice(0,negativeAt);}
 source=source.replace(/\nSteps:\s*\d+[\s\S]*$/,'').trim();
 function stripUnsupported(text){return text.replace(/<(?:lora|lyco|hypernet):[^>]+>|\bembedding:[\w./-]+|--(?:ar|v|s|stylize|chaos|quality|q|seed|no)\b(?:\s+[^\n]*?(?=\s--|$))?/gi,token=>{warnings.push(`未转换的专有指令：${token}`);return '';});}
 function convert(text){
  text=stripUnsupported(text);if(format==='novelai')return text;
  const runs=[];
  function emit(value,weight){if(!value)return;const w=Math.round(weight*1e6)/1e6,last=runs.at(-1);if(last&&last.weight===w)last.text+=value;else runs.push({text:value,weight:w});}
  function walk(s,weight=1,depth=0){if(depth>40){warnings.push('权重嵌套过深，请检查原文。');emit(s,weight);return;}let plain='';const flush=()=>{emit(plain,weight);plain='';};
   for(let i=0;i<s.length;i++){
    if(s[i]==='\\'&&i+1<s.length){plain+=s[++i];continue;}
    const open=s[i],close=open==='('?')':open==='['?']':null;if(!close){plain+=open;continue;}
    let level=1,j=i+1;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]===open)level++;if(s[j]===close&&!--level)break;}
    if(j===s.length){plain+=s.slice(i);warnings.push('存在未闭合的 SD 权重括号，请检查转换结果。');break;}
    flush();let inner=s.slice(i+1,j),factor=open==='('?1.1:1/1.1;
    const explicit=open==='('?inner.match(/:([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/):null;
    if(explicit){factor=Number(explicit[1]);inner=inner.slice(0,-explicit[0].length);}
    if(open==='['&&/:[\d.]+$/.test(inner)){warnings.push(`未转换的 SD 分步提示：${s.slice(i,j+1)}`);}else walk(inner,weight*factor,depth+1);
    i=j;
   }flush();
  }
  walk(text);return runs.map(r=>Math.abs(r.weight-1)<1e-8?r.text:`${r.weight}::${r.text}::`).join('').replace(/,\s*,/g,',').trim();
 }

 return {positive:convert(source),negative:convert(negative),warnings:[...new Set(warnings)],source:input};
}
