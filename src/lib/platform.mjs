import {Capacitor,registerPlugin} from '@capacitor/core';
const native=registerPlugin('FxPlatform');
export const isAndroid=()=>Capacitor.getPlatform()==='android';
export function copyText(text){return isAndroid()?native.copyText({text}):navigator.clipboard.writeText(text);}
export async function shareBlob(blob,name){if(!isAndroid())return saveBlob(blob,name);const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let at=0;at<bytes.length;at+=32768)text+=String.fromCharCode(...bytes.subarray(at,at+32768));return native.shareFile({data:btoa(text),name,mime:blob.type||'application/octet-stream'});}
export async function saveGallery(blob,name){if(!isAndroid())return saveBlob(blob,name);const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let at=0;at<bytes.length;at+=32768)text+=String.fromCharCode(...bytes.subarray(at,at+32768));return native.saveToGallery({data:btoa(text),name,mime:blob.type||'image/png'});}
export async function saveBlob(blob,name){
 if(isAndroid()){const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let at=0;at<bytes.length;at+=32768)text+=String.fromCharCode(...bytes.subarray(at,at+32768));await native.saveFile({data:btoa(text),name,mime:blob.type||'application/octet-stream'});return;}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export function openExternal(url){if(isAndroid())return native.openExternal({url});window.open(url,'_blank','noopener,noreferrer');return Promise.resolve();}
