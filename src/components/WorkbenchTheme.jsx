import {memo,useSyncExternalStore} from 'react';
import {isPrecureSkin,PrecurePromptHeader,PrecureInspectorArt,PrecureMobileBanner,PrecureSwatch} from './PrecureTheme';
import {isTeresaSkin,TeresaPromptHeader,TeresaInspectorArt,TeresaMobileBanner,TeresaSwatch} from './TeresaTheme';

const media=typeof window==='undefined'?null:window.matchMedia('(max-width: 900px)');
const subscribe=listener=>{media?.addEventListener('change',listener);return()=>media?.removeEventListener('change',listener);};
export const useNarrowWorkbench=()=>useSyncExternalStore(subscribe,()=>media?.matches??false,()=>false);
const art='/assets/themes/book-contract/';

export const BookContractPlaque=memo(function BookContractPlaque(){
 return <div className="book-contract-plaque"><img src={art+'bookplate.png'} width="1983" height="793" alt="" decoding="async"/><strong aria-hidden="true">NovelAI FX</strong></div>;
});
export const ClaireBookmark=memo(function ClaireBookmark({compact=false}){
 return <div className={'teresa-bookmark'+(compact?' is-compact':'')} aria-hidden="true"><img src={art+'claire-bookmark.png'} width="1536" height="1024" alt="" decoding="async"/>{!compact&&<span>Claire</span>}</div>;
});
export function BookContractMobile(){
 return <div className="book-contract-mobile"><BookContractPlaque/><ClaireBookmark compact/></div>;
}

const images={
 symphonic:{left:'/assets/themes/symphonic/lily.png',right:'/assets/themes/symphonic/sugar.png'},
 elixir:{duo:'/assets/themes/elixir/duo.png'},
 lemmtear:{left:'/assets/themes/lemmtear/portrait.png'},
};
export const ThemePromptHeader=memo(function ThemePromptHeader({skin}){
 if(isTeresaSkin(skin))return <TeresaPromptHeader/>;
 if(isPrecureSkin(skin))return <PrecurePromptHeader skin={skin}/>;
 if(skin==='book-contract')return <BookContractPlaque/>;
 if(!['symphonic','lemmtear'].includes(skin))return null;
 return <div className={'theme-prompt-art '+skin}><img src={images[skin].left} alt="" decoding="async"/><strong aria-hidden="true">NovelAI FX</strong></div>;
});
export const ThemeInspectorArt=memo(function ThemeInspectorArt({skin,compact=false}){
 if(isTeresaSkin(skin))return <TeresaInspectorArt compact={compact}/>;
 if(isPrecureSkin(skin))return <PrecureInspectorArt skin={skin} compact={compact}/>;
 if(skin==='book-contract')return <ClaireBookmark compact={compact}/>;
 if(skin!=='symphonic')return null;
 return <div className={'theme-inspector-art'+(compact?' is-compact':'')} aria-hidden="true"><img src={images.symphonic.right} alt="" decoding="async"/></div>;
});
export function ThemeWorkbenchBanner({skin,narrow}){
 if(skin==='elixir')return <div className="elixir-frieze"><span className="elixir-cast rose" aria-hidden="true"><img src={images.elixir.duo} alt="" decoding="async"/></span><strong aria-hidden="true">NovelAI FX</strong><span className="elixir-cast lime" aria-hidden="true"><img src={images.elixir.duo} alt="" decoding="async"/></span></div>;
 if(!narrow)return null;
 if(isTeresaSkin(skin))return <TeresaMobileBanner/>;
 if(isPrecureSkin(skin))return <PrecureMobileBanner skin={skin}/>;
 if(skin==='book-contract')return <BookContractMobile/>;
 if(skin==='symphonic')return <div className="symphonic-mobile"><img src={images.symphonic.left} alt=""/><strong>NovelAI FX</strong><img src={images.symphonic.right} alt=""/></div>;
 if(skin==='lemmtear')return <div className="lemmtear-mobile"><ThemePromptHeader skin={skin}/></div>;
 return null;
}
export function WorkbenchSwatch({skin}){
 if(isTeresaSkin(skin))return <TeresaSwatch/>;
 if(isPrecureSkin(skin))return <PrecureSwatch skin={skin}/>;
 if(skin==='classic')return <span className="classic-mini"><i/><i/><i/></span>;
 if(skin==='book-contract')return <><img src={art+'bookplate.png'} width="1983" height="793" alt="" loading="lazy" decoding="async"/><img src={art+'claire-bookmark.png'} width="1536" height="1024" alt="" loading="lazy" decoding="async"/></>;
 if(skin==='elixir')return <img src={images.elixir.duo} alt="" loading="lazy" decoding="async"/>;
 return <><img src={images[skin].left} alt="" loading="lazy" decoding="async"/>{images[skin].right&&<img src={images[skin].right} alt="" loading="lazy" decoding="async"/>}</>;
}
