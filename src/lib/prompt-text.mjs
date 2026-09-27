export function compilePrompt(prompt,{qualitySuffix='',transparent=false,imageText='',autoText=false}={}){
 const match=/(?:^|\n)\s*Text\s*:/i.exec(prompt);
 let base=match?prompt.slice(0,match.index).trimEnd():prompt;
 let text=match?prompt.slice(match.index).trim():'';
 if(!text){
  const quoted=autoText?[...prompt.matchAll(/"([^"\n]+)"|“([^”]+)”|「([^」]+)」/gu)].map(m=>m[1]||m[2]||m[3]):[];
  const lines=[imageText.trim(),...quoted].filter(Boolean);
  if(lines.length)text='Text: '+[...new Set(lines)].join('\n');
 }
 const suffix=text?qualitySuffix.replace(/,\s*no text\b/gi,''):qualitySuffix;
 if(transparent&&!/\btransparent[ _]background\b/i.test(base))base+=(base.trim()?', ':'')+'transparent background';
 return base+(suffix&&!base.endsWith(suffix)?suffix:'')+(text?'\n'+text:'');
}
