import {useEffect,useRef,useState} from 'react';
import {danbooruImageUrl} from '../lib/danbooru.mjs';

// Keep a completed image while its mounted gallery is hidden. A cancelled read
// is resumed only when visible again; completed failures need an explicit reload.
export default function useDanbooruImage(src,{active=true,revision=0,queue}={}){
 const saved=useRef(null),[state,setState]=useState({image:'',blob:null,error:'',failed:false});
 useEffect(()=>()=>{if(saved.current?.image)URL.revokeObjectURL(saved.current.image);saved.current=null;},[src,revision]);
 useEffect(()=>{
  if(!active||!src||saved.current?.complete)return;
  const controller=new AbortController(),record={complete:false,image:''};saved.current=record;
  setState({image:'',blob:null,error:'',failed:false});
  const read=async()=>{
   const response=await fetch(danbooruImageUrl(src),{signal:controller.signal});
   if(!response.ok){const body=await response.json().catch(()=>null);throw Error(body?.error?.message||'图片暂时无法加载。');}
   const blob=await response.blob();controller.signal.throwIfAborted();
   const image=URL.createObjectURL(blob);Object.assign(record,{complete:true,image});setState({image,blob,error:'',failed:false});
  };
  (queue?queue.run(read,controller.signal):read()).catch(error=>{if(!controller.signal.aborted){record.complete=true;setState({image:'',blob:null,error:error instanceof TypeError?'无法连接应用本机服务，请确认应用仍在运行。':error.message,failed:true});}});
  return()=>controller.abort();
 },[src,active,revision,queue]);
 return state;
}
