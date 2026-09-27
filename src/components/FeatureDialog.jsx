import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export default function FeatureDialog({title,icon,onClose,children,error,onClearError}){
 const ref=useRef(null);
 useEffect(()=>{const previous=document.activeElement;ref.current.showModal();return()=>{ref.current?.close();previous?.focus?.({preventScroll:true});};},[]);
 return <dialog ref={ref} className="feature-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}><header className="feature-dialog-header"><h2>{icon}{title}</h2><button aria-label="关闭功能面板" onClick={onClose}><X size={20}/></button></header>{error&&<div className="banner error" role="alert"><span>{error}</span><button aria-label="关闭面板提示" onClick={onClearError}><X size={14}/></button></div>}{children}</dialog>;
}
