import {memo} from 'react';

const A='/assets/themes/exstia/';
export const EXSTIA_THEMES=Object.freeze({
 'exstia':{quote:['光の翼よ、','闇を裂け'],motif:'marina',main:{file:'marina-2026-transform.webp',w:1155,h:1177,crop:'320 70 730 480'},side:{file:'marina-2026-normal.webp',w:1155,h:1177,crop:'425 95 440 390',face:'485 115 270 300'}},
 'exstia-chevalier':{quote:['王家の剣','に誓って'],motif:'reese',main:{file:'reese-2024-transform.png',w:1369,h:1455,crop:'435 250 865 555'},side:{file:'reese-2024-knight.png',w:1369,h:1455,crop:'553 310 560 470',face:'675.5 335 315 335'}},
 'exstia-magica':{quote:['雷光よ、','四方を穿て'],motif:'azarin',main:{file:'azarin.png',w:672,h:913,crop:'55 0 600 410'},side:{file:'azarin-normal.png',w:672,h:913,crop:'127 10 390 345',face:'177 20 290 310'}},
});
export const isExstiaSkin=skin=>Object.hasOwn(EXSTIA_THEMES,skin);
const Portrait=memo(function Portrait({art,face=false,fit='xMidYMin slice',className=''}){
 return <svg className={'exstia-portrait '+className} viewBox={face?art.face:art.crop} preserveAspectRatio={fit} aria-hidden="true" focusable="false"><image href={A+art.file} width={art.w} height={art.h}/></svg>;
});
function Motif({id,context}){
 return <svg className={'exstia-motif exstia-motif-'+context} viewBox="0 0 240 190" fill="none" stroke="currentColor" strokeWidth=".85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
 {id==='marina'?<><path d="M104 28 168 78 104 128 40 78Z"/><path d="m104 41 48 37-48 37-48-37ZM40 78h128M104 28v100"/><path d="M8 144c64-16 112-9 196-77M22 157c65-17 123-23 180-73"/><path className="motif-fill" d="m104 41 48 37-48 37-48-37Z"/></>:id==='reese'?<><path d="m118 10 10 24-10 89-10-89ZM118 34v89M91 123h54l-8 7h-38ZM114 131v30h8v-30M112 163h12"/><path d="M70 23c-15 36-37 53-62 65 29-4 47-14 56-26-9 28-27 46-50 57 39-8 65-30 75-63M178 23c15 36 37 53 62 65-29-4-47-14-56-26 9 28 27 46 50 57-39-8-65-30-75-63"/><path className="motif-fill" d="m118 10 10 24-10 89-10-89Z"/></>:<><path d="M28 110C8 38 83 3 150 29M173 43c56 73-49 134-114 103"/><path strokeDasharray="2 7" d="M40 110C24 52 88 18 147 42M162 54c42 58-42 107-95 83"/><path d="m151 16 8 17-8 17-8-17ZM196 93l17 8-17 8-17-8ZM77 144l8 17-8 17-8-17ZM25 54l17 8-17 8-17-8Z"/><path className="motif-fill" d="m151 23 5 10-5 10-5-10ZM196 97l10 4-10 4-10-4ZM77 151l5 10-5 10-5-10ZM25 58l10 4-10 4-10-4Z"/></>}
 </svg>;
}
function Quote({theme,mobile=false}){return <blockquote className={'exstia-quote'+(mobile?' exstia-mobile-quote':'')} lang="ja"><span className="exstia-quote-lead">{theme.quote[0]}</span><span className="exstia-quote-main">{theme.quote[1]}</span></blockquote>;}
export const ExstiaPromptHeader=memo(function ExstiaPromptHeader({skin}){const t=EXSTIA_THEMES[skin];return <div className="exstia-hero"><Portrait art={t.main}/><Motif id={t.motif} context="hero"/><Quote theme={t}/><span className="exstia-signature-line" aria-hidden="true"/></div>;});
export const ExstiaInspectorArt=memo(function ExstiaInspectorArt({skin,compact=false}){const t=EXSTIA_THEMES[skin];return <div className={'exstia-companion'+(compact?' is-compact':'')} aria-hidden="true"><Portrait art={t.side} face={compact} fit={compact?'xMidYMin meet':'xMidYMin slice'} className={compact?'exstia-side-compact':'exstia-side-wide'}/>{!compact&&<Motif id={t.motif} context="side"/>}</div>;});
export const ExstiaMobileBanner=memo(function ExstiaMobileBanner({skin}){const t=EXSTIA_THEMES[skin];return <div className="exstia-mobile"><div><Portrait art={t.main} fit="xMidYMin meet"/></div><div><Portrait art={t.side} fit="xMidYMin meet"/></div><Quote theme={t} mobile/></div>;});
export function ExstiaSwatch({skin}){const t=EXSTIA_THEMES[skin];return <span className="exstia-swatch"><Portrait art={t.main}/><Portrait art={t.side} face/></span>;}
export function ExstiaSkinBadge({skin}){if(!isExstiaSkin(skin))return null;return <span className="exstia-skin-badge" aria-hidden="true"><Portrait art={EXSTIA_THEMES[skin].side} face/></span>;}
export function ExstiaGenerateBadge({skin}){
 if(!isExstiaSkin(skin))return null;
 return <span className="exstia-generate-badge" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" focusable="false">
 {skin==='exstia'?<><path d="M23 29 8 20 13 35 24 39M41 29 56 20 51 35 40 39M12 27 22 33M52 27 42 33M32 15 42 31 32 49 22 31Z"/><path className="motif-fill" d="M32 15V49L22 31Z"/></>:skin==='exstia-chevalier'?<path d="M22 23 18 25 22 41 32 51 42 41 46 25 42 23M32 8 37 16 34 35H42L38 40H34V53H30V40H26L22 35H30L27 16ZM32 16V34"/>:<path d="M32 7 37 15 32 22 27 15ZM57 32 49 37 42 32 49 27ZM32 57 27 49 32 42 37 49ZM7 32 15 27 22 32 15 37ZM32 25 39 32 32 39 25 32Z"/>}
 </svg></span>;
}
