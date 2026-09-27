import {memo} from 'react';
import './teresa-theme.css';

const art='/assets/themes/teresa/';

export const isTeresaSkin=skin=>skin==='teresa';

export const TeresaPromptHeader=memo(function TeresaPromptHeader(){
 return <div className="teresa-prompt-header" aria-hidden="true">
  <img src={art+'letter-ornament.svg'} width="720" height="220" alt="" decoding="async"/>
  <span>TERESA&nbsp; / &nbsp;PRIVATE LETTERS</span>
  <strong>NovelAI FX</strong>
 </div>;
});

export const TeresaInspectorArt=memo(function TeresaInspectorArt({compact=false}){
 return <div className={'teresa-inspector-art'+(compact?' is-compact':'')} aria-hidden="true">
  <img src={art+(compact?'compact.png':'wide.png')} width={compact?887:1536} height={compact?1774:1024} alt="" decoding="async"/>
  {!compact&&<span>Teresa</span>}
 </div>;
});

export function TeresaMobileBanner(){
 return <div className="teresa-mobile-banner"><TeresaPromptHeader/><TeresaInspectorArt compact/></div>;
}

export function TeresaSwatch(){
 return <span className="teresa-swatch" aria-hidden="true"><i/><i/><i/></span>;
}
