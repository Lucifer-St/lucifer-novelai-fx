export default function TagSuggestionSlot({id,mode,compact=false}){
 if(mode==='off')return null;
 return <div id={id} className={`tag-suggestion-slot${compact?' compact-tag-slot':''}`} aria-label="关联词栏目">
   {!compact&&<div className="tag-suggestion-idle"><strong>关联词</strong><span>在上方输入或选择当前词条</span><small>Tab 选词 · 右侧设置可关闭</small></div>}
 </div>;
}
