import {memo,useId} from 'react';
import {ChevronRight} from 'lucide-react';
const art={
 'precure-scrapbook':{file:'scrapbook-atlas.png',left:[0,53,459,231],right:[1124,54,402,190],model:[14,226,224,39],canopy:[461,56,663,53],compact:[1167,55,205,187]},
 'precure-days':{file:'days-atlas.png',left:[0,56,458,234],right:[1121,54,405,193],model:[217,238,219,44],canopy:[460,58,660,42],compact:[1180,53,196,192]},
};
export const isPrecureSkin=skin=>Object.hasOwn(art,skin);
const rectangle=([x,y,w,h])=>`M${x} ${y}h${w}v${h}h-${w}Z`;
// Only approved illustration regions are displayed; labels, controls, results
// and editable content remain native. The old model-label pixels are excluded.
const Illustration=memo(function Illustration({skin,region,exclude=[],className='',fit='none'}){
 const clip=useId(),p=art[skin];
 return <svg className={'precure-illustration '+className} viewBox={region.join(' ')} preserveAspectRatio={fit} aria-hidden="true" focusable="false"><defs><clipPath id={clip}><path d={rectangle(region)+exclude.map(rectangle).join('')} clipRule="evenodd" fillRule="evenodd"/></clipPath></defs><image href={'/assets/themes/precure/'+p.file} width="1526" height="1030" clipPath={`url(#${clip})`}/></svg>;
});
export const PrecurePromptHeader=memo(function PrecurePromptHeader({skin}){
 const p=art[skin];
 return <div className={'precure-prompt-header '+skin}><Illustration skin={skin} region={p.left} exclude={[p.model]}/><strong className="precure-model-label" aria-hidden="true">Lucifer NovelAI FX</strong></div>;
});
export const PrecureInspectorArt=memo(function PrecureInspectorArt({skin,compact=false}){
 const region=art[skin][compact?'compact':'right'];
 return <div className={'precure-inspector-art'+(compact?' is-compact':'')} style={compact?undefined:{aspectRatio:`${region[2]} / ${region[3]}`}} aria-hidden="true"><Illustration skin={skin} region={region} fit="xMidYMid meet"/></div>;
});
export function PrecureMobileBanner({skin}){
 return <div className="precure-mobile-banner" aria-hidden="true"><Illustration skin={skin} region={skin==='precure-days'?[119,56,271,182]:[136,54,314,170]} fit="xMidYMin slice"/><Illustration skin={skin} region={skin==='precure-days'?[1148,54,292,192]:[1160,54,293,190]} fit="xMidYMin slice"/></div>;
}
export function PrecureSwatch({skin}){
 return <span className="precure-swatch" aria-hidden="true"><Illustration skin={skin} region={skin==='precure-days'?[119,56,271,182]:[136,54,314,170]} fit="xMidYMid slice"/><Illustration skin={skin} region={art[skin].compact} fit="xMidYMin slice"/></span>;
}
export const ThemeCanvasFraming=memo(function ThemeCanvasFraming({skin}){
 if(!isPrecureSkin(skin))return null;return <div className="precure-canvas-canopy" aria-hidden="true"><Illustration skin={skin} region={art[skin].canopy}/></div>;
});
export function ThemeBrandMark({skin}){
 return <span className="precure-brand-mark"><Illustration skin={skin} region={skin==='precure-days'?[18,11,54,40]:[18,14,35,32]}/></span>;
}
export const ThemeGenerateFrame=memo(function ThemeGenerateFrame({skin}){
 if(skin!=='precure-days')return null;
 return <span className="precure-generate-frame" aria-hidden="true"><Illustration skin={skin} region={[27,867,417,63]} exclude={[[46,877,379,40]]}/></span>;
});
export const ThemeDockDecoration=memo(function ThemeDockDecoration({skin,side='left'}){
 if(!isPrecureSkin(skin))return null;
 if(skin==='precure-scrapbook')return <span className={'precure-dock-decoration '+side} aria-hidden="true"><Illustration skin={skin} region={side==='left'?[0,934,62,58]:[1489,965,37,27]}/></span>;
 return <span className={'precure-dock-decoration '+side} aria-hidden="true">{side==='left'?<><Illustration skin={skin} region={[0,927,82,63]} className="precure-books"/><Illustration skin={skin} region={[80,963,115,28]} className="precure-pen"/></>:<Illustration skin={skin} region={[1465,880,61,111]}/>}</span>;
});
export const ThemeGenerationKeepsake=memo(function ThemeGenerationKeepsake({skin}){
 if(skin!=='precure-days')return null;
 return <figure className="precure-generation-keepsake" aria-hidden="true"><div className="precure-keepsake-mat"><img src="/assets/themes/precure/memory.png" width="2294" height="1290" alt="" decoding="async" draggable="false"/></div></figure>;
});
