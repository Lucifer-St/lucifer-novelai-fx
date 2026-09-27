import '../prompt-layout.css';
export default function PromptLayoutSettings({value,onChange,error}){
 return <section className="prompt-layout-settings" aria-label="工作区布局设置"><h3>提示词工作区布局</h3><p>选择适合你的编辑方式。布局和折叠状态单独保存在本机。</p><fieldset><legend>编辑方式</legend>
  <label><input type="radio" name="prompt-layout" value="classic" checked={value?.mode!=='merged'} onChange={()=>onChange?.('classic')}/><span><strong>经典标签布局</strong><small>主提示词、角色分开切换；沿用当前栏宽与正负面标签页。</small></span></label>
  <label><input type="radio" name="prompt-layout" value="merged" checked={value?.mode==='merged'} onChange={()=>onChange?.('merged')}/><span><strong>合并滚动布局</strong><small>主正负面与所有角色在一列中展开；主区和每个角色均可独立折叠。</small></span></label>
 </fieldset><p className="hint">折叠只收起编辑区域，仍会使用已启用角色的提示词。切换不修改提示词、生成参数或列宽。</p>{error&&<p role="status">{error}</p>}</section>;
}
