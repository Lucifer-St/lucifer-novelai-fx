import {Download,X} from 'lucide-react';
import '../update-notification.css';
export default function UpdateNotification({release,onOpen,onDismiss}){
 if(!release)return null;
 return <aside className="update-notification" aria-label="新版本通知" role="status">
  <Download size={20} aria-hidden="true"/>
  <div><strong>新版本 {release.latestVersion} 已发布</strong><p>可查看更新内容并升级，当前编辑内容会保留。</p><button type="button" onClick={onOpen}>查看更新</button></div>
  <button className="update-notification-close" type="button" aria-label="稍后提醒本版本" onClick={onDismiss}><X size={16}/></button>
 </aside>;
}
