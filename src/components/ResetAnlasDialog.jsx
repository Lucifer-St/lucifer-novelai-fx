import {useState} from 'react';
import FeatureDialog from './FeatureDialog';
import {api} from '../lib/api.mjs';
export default function ResetAnlasDialog({onClose,onReset}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <FeatureDialog title="重置 Anlas 累计？" onClose={()=>{if(!busy)onClose();}} error={error} onClearError={()=>setError('')}><div className="anlas-reset-confirm"><p>累计消耗会从现在重新计数。已记录的余额、手动报价和历史消费记录都会保留。</p><p>关闭应用、重新打开或更新版本不会重置累计。</p><div className="row-buttons"><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{const d=await api('/api/anlas',{method:'POST',body:{action:'session',confirmReset:true}});onReset(d);}catch(e){setError(e.message);setBusy(false);}}}>{busy?'正在重置…':'确认重置'}</button></div></div></FeatureDialog>;
}
