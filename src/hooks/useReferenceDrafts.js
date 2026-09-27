import {useEffect,useRef,useState} from 'react';
import {MODEL_IDS} from '../lib/model-policy.mjs';
import {referencePart,mergeReferenceDrafts} from '../lib/reference-drafts.mjs';
function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open('lucifer-reference-drafts-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function read(){const db=await open();try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('drafts'),request=transaction.objectStore('drafts').get('models');request.onsuccess=()=>resolve(request.result||{});request.onerror=()=>reject(request.error);});}finally{db.close();}}
async function write(models){const db=await open();try{await new Promise((resolve,reject)=>{const transaction=db.transaction('drafts','readwrite');transaction.objectStore('drafts').put(models,'models');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}}
export default function useReferenceDrafts(state,setState,onError){
 const initial=useRef(state),latest=useRef(state),errorRef=useRef(onError),[ready,setReady]=useState(false);
 latest.current=state;errorRef.current=onError;
 useEffect(()=>{let active=true;read().then(models=>{if(!active)return;setState(old=>mergeReferenceDrafts(initial.current,old,models));setReady(true);}).catch(()=>{if(active)errorRef.current?.('参考图草稿暂时无法恢复，未覆盖已保存内容；当前新参考图仅留在窗口内，请保留窗口并稍后刷新重试。');});return()=>{active=false;};},[]);
 useEffect(()=>{if(!ready)return;const save=()=>{const current=latest.current,models={};for(const id of MODEL_IDS)if(current.modelDrafts?.[id])models[id]=referencePart(current.modelDrafts[id]);models[current.model]=referencePart(current);void write(models).catch(()=>errorRef.current?.('参考图草稿保存失败，请保留当前窗口；已生成结果未受影响。'));};const timer=setTimeout(save,450);window.addEventListener('pagehide',save);return()=>{clearTimeout(timer);window.removeEventListener('pagehide',save);};},[ready,state.model,state.vibes,state.precise,state.referenceMode,state.modelDrafts,state.normalize]);
}
