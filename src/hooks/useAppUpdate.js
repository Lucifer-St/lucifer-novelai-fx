import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../lib/api.mjs';
const PREF='lucifer-share-auto-update-check-v1';
export default function useAppUpdate(){
 const [automatic,setAutomatic]=useState(()=>{try{return localStorage.getItem(PREF)!=='off';}catch{return true;}});
 const [result,setResult]=useState(null);
 const [available,setAvailable]=useState(null),[dismissed,setDismissed]=useState('');
 const pending=useRef(false),lastAttempt=useRef(0),nextCheck=useRef(0);
 const acceptResult=useCallback(value=>{
  setResult(value);
  if(value?.status==='update_available')setAvailable(value);
  else if(value?.status==='current')setAvailable(null);
 },[]);
 useEffect(()=>{
  if(!automatic)return;
  let disposed=false;
  async function check(reconnected=false){
   const now=Date.now();
   if(pending.current||navigator.onLine===false||document.visibilityState==='hidden'||now-lastAttempt.current<60000||(!reconnected&&now<nextCheck.current))return;
   pending.current=true;lastAttempt.current=now;
   try{
    const value=await api('/api/check-updates',{method:'POST',body:{automatic:true},signal:AbortSignal.timeout(20000)});
    if(!disposed){acceptResult(value);nextCheck.current=Date.now()+(['network_error','repository_error'].includes(value.status)?5*60000:6*60*60000);}
   }catch{nextCheck.current=Date.now()+5*60000;}
   finally{pending.current=false;}
  }
  const resumed=()=>{if(document.visibilityState==='visible')check();},online=()=>check(true);
  const timer=setTimeout(()=>check(),3000),interval=setInterval(()=>check(),60000);
  document.addEventListener('visibilitychange',resumed);window.addEventListener('online',online);
  return()=>{disposed=true;clearTimeout(timer);clearInterval(interval);document.removeEventListener('visibilitychange',resumed);window.removeEventListener('online',online);};
 },[automatic,acceptResult]);
 function changeAutomatic(value){setAutomatic(value);try{localStorage.setItem(PREF,value?'on':'off');}catch{}}
 return {automatic,setAutomatic:changeAutomatic,result,setResult:acceptResult,available,notification:available?.latestVersion!==dismissed?available:null,dismissNotification:()=>setDismissed(available?.latestVersion||'')};
}
