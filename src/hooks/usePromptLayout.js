import {useEffect,useState} from 'react';
import {readPromptLayout,writePromptLayout,toggleCharacterFold,toggleFieldFold} from '../lib/prompt-layout.mjs';
export default function usePromptLayout(){
 const [preferences,setPreferences]=useState(()=>{try{return readPromptLayout(localStorage);}catch{return readPromptLayout(null);}}),[error,setError]=useState('');
 useEffect(()=>{try{writePromptLayout(localStorage,preferences);setError('');}catch{setError('布局已生效，但浏览器未能保存；重开后可能恢复默认。');}},[preferences]);
 return {preferences,error,setMode:mode=>setPreferences(old=>({...old,mode:mode==='merged'?'merged':'classic'})),toggleMain:()=>setPreferences(old=>({...old,mainCollapsed:!old.mainCollapsed})),toggleCharacter:id=>setPreferences(old=>toggleCharacterFold(old,id)),toggleField:id=>setPreferences(old=>toggleFieldFold(old,id))};
}
