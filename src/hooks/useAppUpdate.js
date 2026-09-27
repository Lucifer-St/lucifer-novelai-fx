import {useEffect,useState} from 'react';
import {api} from '../lib/api.mjs';
const PREF='lucifer-share-auto-update-check-v1';
export default function useAppUpdate(){
 const [automatic,setAutomatic]=useState(()=>{try{return localStorage.getItem(PREF)!=='off';}catch{return true;}});
 const [result,setResult]=useState(null);
 useEffect(()=>{
  if(!automatic)return;
  let disposed=false;
  const check=()=>api('/api/check-updates',{method:'POST',body:{automatic:true},signal:AbortSignal.timeout(20000)}).then(value=>{if(!disposed)setResult(value);}).catch(()=>{});
  const timer=setTimeout(check,3000),interval=setInterval(check,6*60*60*1000);
  return()=>{disposed=true;clearTimeout(timer);clearInterval(interval);};
 },[automatic]);
 function changeAutomatic(value){setAutomatic(value);try{localStorage.setItem(PREF,value?'on':'off');}catch{}}
 return {automatic,setAutomatic:changeAutomatic,result,setResult};
}
