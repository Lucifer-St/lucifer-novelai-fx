import {useCallback,useRef,useState} from 'react';
import {APPEARANCE_KEY,readAppearance,normalizeAppearance} from '../lib/loading-skins.mjs';
export default function useAppearance(){
 const [appearance,setAppearance]=useState(()=>{try{return readAppearance(globalThis.localStorage);}catch{return readAppearance(null);}});
 const [appearanceError,setAppearanceError]=useState('');
 const current=useRef(appearance);
 const updateAppearance=useCallback(patch=>{
   const next=normalizeAppearance({...current.current,...patch});
   current.current=next;setAppearance(next);
   try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(next));setAppearanceError('');}
   catch{setAppearanceError('当前选择已生效，但浏览器未能保存外观偏好。');}
 },[]);
 return {appearance,updateAppearance,appearanceError};
}
