import {LOADING_SKINS,LOADING_ILLUSTRATED_COUNT,RANDOM_LOADING_SKIN,WORKBENCH_SKINS,getLoadingSkin} from '../lib/loading-skins.mjs';
import {Shuffle} from 'lucide-react';
import LoadingArtwork from './LoadingArtwork';
import {WorkbenchSwatch} from './WorkbenchTheme';
export default function AppearancePanel({value,onChange,error}){
 const selected=getLoadingSkin(value.loadingSkin);
 const random=value.loadingSkin==='random';
 return <div className="appearance-workspace">
  <fieldset className="workbench-skin-fieldset"><legend>工作台皮肤</legend><p className="appearance-hint">换一套陪伴创作的装帧。加载画面可在下方独立选择。</p><div className="workbench-skin-grid">{WORKBENCH_SKINS.map(s=><label key={s.id} className={'workbench-skin-choice'+(value.workbenchSkin===s.id?' chosen':'')}>
   <input type="radio" name="workbench-skin" value={s.id} checked={value.workbenchSkin===s.id} onChange={()=>onChange({workbenchSkin:s.id})} aria-label={s.name}/>
   <span className={'workbench-skin-thumb '+s.id} aria-hidden="true"><WorkbenchSwatch skin={s.id}/></span>
   <span className="workbench-skin-label"><strong>{s.name}</strong><small>{s.subtitle}</small></span>
  </label>)}</div><label className="appearance-character-controls"><input type="checkbox" aria-label="角色装饰" aria-describedby="appearance-character-hint" checked={value.characterDecorations} onChange={e=>onChange({characterDecorations:e.target.checked})}/>角色装饰<span id="appearance-character-hint">Teresa、Sacred Lineage 与 Symphonic 的角色图标和按钮，保留动作文字。</span></label></fieldset>
  <div className="appearance-columns"><section>
   <fieldset className="loading-skin-fieldset"><legend>加载画面</legend><p className="appearance-hint">只改变新图等待时的画面，与你正在查看的作品分开。</p>
    <div className="loading-skin-grid">{[RANDOM_LOADING_SKIN,...LOADING_SKINS].map(s=><label key={s.id} className={'loading-skin-choice'+(s.id===value.loadingSkin?' chosen':'')}>
     <input type="radio" name="loading-skin" value={s.id} checked={s.id===value.loadingSkin} onChange={()=>onChange({loadingSkin:s.id})} aria-label={s.name+' · '+s.subtitle}/>
     <span className={'loading-skin-thumb loading-thumb-'+(s.layout||'cutout')}>{s.image?<img src={s.image} alt="" width={s.width||1254} height={s.height||1254} loading="lazy" decoding="async"/>:s.id==='random'?<Shuffle className="random-skin-icon" size={34} aria-hidden="true"/>:<span aria-hidden="true">✧</span>}</span>
     <span className="loading-skin-label"><strong>{s.name}</strong><small>{s.subtitle}</small></span>
    </label>)}</div>
   </fieldset>
   <label className="appearance-motion"><input type="checkbox" checked={value.motion==='off'} onChange={e=>onChange({motion:e.target.checked?'off':'system'})}/>减少动态效果<span>也会遵循系统的减少动态设置</span></label>
   {error&&<p className="appearance-error" role="status">{error}</p>}
  </section><aside className="appearance-live"><span>{random?'随机切换规则':'加载卡预览'}</span><div>{random?<div className="random-skin-preview"><Shuffle size={40}/><strong>每次生成，换一个陪伴</strong><p>从 {LOADING_ILLUSTRATED_COUNT} 套插画中随机选一张，避开刚用过的画面。整次等待保持不变，简洁黑卡不参与抽选。</p></div>:<LoadingArtwork skinId={selected.id} elapsed={0} motion={value.motion}/>}</div><p>{random?'每次提交时抽选，生成中不会跳换。':selected.name}<br/>偏好保存在本机。</p></aside></div>
 </div>;
}
