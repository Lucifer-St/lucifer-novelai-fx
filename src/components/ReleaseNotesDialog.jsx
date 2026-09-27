import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Mail,X} from 'lucide-react';
import '../release-notes.css';

/** Display only: the caller owns visibility, release history and acknowledgement storage. */
export default function ReleaseNotesDialog({release,onClose}){
 const dialogRef=useRef(null),closeRef=useRef(null),dismissRef=useRef(null),dismissed=useRef(false);
 const [artFailed,setArtFailed]=useState(false);
 const titleId=useId(),introId=useId();
 const visible=Boolean(release);
 useEffect(()=>{
  if(!visible)return;
  const dialog=dialogRef.current,previous=document.activeElement;
  if(!dialog)return;
  dismissed.current=false;
  if(!dialog.open)dialog.showModal();
  closeRef.current?.focus({preventScroll:true});
  return()=>{
   if(dialog.open)dialog.close();
   if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});
  };
 },[visible]);
 function dismiss(){
  if(dismissed.current)return;
  dismissed.current=true;
  dialogRef.current?.close();
  onClose?.();
 }
 function handleKeyDown(event){
  event.stopPropagation();
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')event.preventDefault();
  if(event.key==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const active=document.activeElement;
   if(event.shiftKey&&active===closeRef.current){event.preventDefault();dismissRef.current?.focus();}
   else if(!event.shiftKey&&active===dismissRef.current){event.preventDefault();closeRef.current?.focus();}
  }
 }
 if(!visible||typeof document==='undefined')return null;
 const title=typeof release.title==='string'&&release.title.trim()?release.title:'更新说明';
 const version=typeof release.version==='string'?release.version.trim():'';
 const features=Array.isArray(release.features)?release.features.filter(item=>item&&typeof item==='object'):[];
 return createPortal(
  <dialog ref={dialogRef} className="release-notes-dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={introId}
   onCancel={event=>{event.preventDefault();dismiss();}}
   onKeyDown={handleKeyDown}>
   <div className="release-notes-shell">
    <header className="release-notes-header">
     <div className="release-notes-heading"><h2 id={titleId}>{title}</h2>{version&&<span className="release-notes-version">{version.startsWith('v')?version:'v'+version}</span>}</div>
     <p id={introId} className="release-notes-intro">本次新增与改进{release.date&&<> · <time dateTime={release.date}>{release.date}</time></>}</p>
     <button ref={closeRef} className="release-notes-close" type="button" aria-label="关闭更新说明" onClick={dismiss}><X size={20} aria-hidden="true"/></button>
    </header>
    <section className="release-notes-content" role="region" aria-label="更新内容" tabIndex={0}>
     {features.length?<ol className="release-notes-list" role="list">{features.map((feature,index)=><li className="release-notes-feature" key={index}>
      <span className="release-notes-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
      <div className="release-notes-feature-copy">
       {typeof feature.title==='string'&&<h3>{feature.title}</h3>}
       {typeof feature.description==='string'&&<p>{feature.description}</p>}
      </div>
     </li>)}</ol>:<p className="release-notes-empty">当前版本暂无详细更新说明。</p>}
    </section>
    <aside className="release-notes-art" aria-hidden="true">
     <div className="release-notes-art-light"/>
     {!artFailed&&<img src="/assets/release-notes/sugar-guide.png" alt="" width="1086" height="1448" decoding="async" draggable={false} onError={()=>setArtFailed(true)}/>}
    </aside>
    <footer className="release-notes-footer">
     <p className="release-notes-reopen"><Mail size={16} aria-hidden="true"/><span>可从信箱再次查看</span></p>
     <button ref={dismissRef} className="release-notes-dismiss" type="button" onClick={dismiss}>我知道了<ArrowRight size={17} aria-hidden="true"/></button>
    </footer>
   </div>
  </dialog>,document.body
 );
}
