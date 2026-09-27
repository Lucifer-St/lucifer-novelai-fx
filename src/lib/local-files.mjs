import {api} from './api.mjs';
export const localFileAction=(url,body)=>api(url,{method:'POST',body,headers:{'Content-Type':'application/json','X-FX-Action':'local-files'}});
export const openLocalFolder=(kind,extra={})=>localFileAction('/api/storage/open',{kind,...extra});
