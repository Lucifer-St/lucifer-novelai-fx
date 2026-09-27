import {saveBlob} from './platform.mjs';
export async function api(url,{method='GET',body,...options}={}){
 const r=await fetch(url,{method,...body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{},...options});
 let data;try{data=await r.json();}catch{throw new Error('本地服务响应无效，请检查是否需要重启工作台。');}
 if(!r.ok)throw Object.assign(new Error(data.error?.message||`请求失败 (${r.status})`),{code:data.error?.code,status:r.status});return data;
}
export function downloadData(data,name){return saveBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);}
