import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useId,
} from "react";
import {useTagSuggestions} from '../hooks/useTagSuggestions';
import TagSuggestions from './TagSuggestions';
import { tokenizePromptWeights } from "../lib/prompt-weights.mjs";
import {adjustPromptWeight} from '../lib/weight-adjust.mjs';
import "../weight-editor.css";

const mirrorProperties = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "fontKerning",
  "fontFeatureSettings",
  "fontVariationSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textAlign",
  "textIndent",
  "textTransform",
  "tabSize",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "direction",
];

// The real textarea owns input, selection, undo, IME and accessibility. The
// non-interactive mirror paints backgrounds only and contains no editable text.
const WeightedPromptInput = forwardRef(function WeightedPromptInput(
  { value = "", onScroll, onKeyDown, suggestionMode='off', suggestionTarget, onReplaceRange, autoResize=false, active=true, ...props },
  forwardedRef,
) {
  const input = useRef(null);
  const mirror = useRef(null);
  const suggestionId=useId();
  const suggestions=useTagSuggestions({input,value,mode:suggestionMode,onChange:props.onChange,onReplace:onReplaceRange});
  const segments = useMemo(() => tokenizePromptWeights(value), [value]);
  useImperativeHandle(forwardedRef, () => input.current);

  // Change only layout: the native textarea keeps its selection, IME and undo.
  // Observe width, not height, so a native resize drag is not immediately undone.
  useLayoutEffect(() => {
    if (!autoResize || !active) return;
    const textarea=input.current;
    function fitContent(){
      if(!textarea.clientWidth)return;
      const style=getComputedStyle(textarea),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      const min=parseFloat(style.minHeight)||100,max=parseFloat(style.maxHeight)||600;
      const scroll=textarea.scrollTop;
      textarea.style.height='0px';
      textarea.style.height=`${Math.max(min,Math.min(max,textarea.scrollHeight+border))}px`;
      textarea.scrollTop=scroll;
    }
    fitContent();
    let width=textarea.clientWidth;
    const observer=new ResizeObserver(()=>{const next=textarea.clientWidth;if(next!==width){width=next;fitContent();}});
    observer.observe(textarea);
    document.fonts?.addEventListener('loadingdone',fitContent);
    return()=>{observer.disconnect();document.fonts?.removeEventListener('loadingdone',fitContent);};
  },[autoResize,active,value]);

  function syncScroll() {
    if (!input.current || !mirror.current) return;
    mirror.current.scrollTop = input.current.scrollTop;
    mirror.current.scrollLeft = input.current.scrollLeft;
  }

  useLayoutEffect(() => {
    const textarea = input.current;
    const backdrop = mirror.current;
    function syncLayout() {
      const style = getComputedStyle(textarea);
      for (const property of mirrorProperties) {
        backdrop.style[property] = style[property];
      }
      // clientWidth excludes the native scrollbar, preserving identical wraps.
      Object.assign(backdrop.style, {
        width: `${textarea.clientWidth}px`,
        height: `${textarea.clientHeight}px`,
        left: `${textarea.offsetLeft + textarea.clientLeft}px`,
        top: `${textarea.offsetTop + textarea.clientTop}px`,
      });
      syncScroll();
    }
    syncLayout();
    const observer = new ResizeObserver(syncLayout);
    observer.observe(textarea);
    window.addEventListener("resize", syncLayout);
    document.fonts?.addEventListener("loadingdone", syncLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncLayout);
      document.fonts?.removeEventListener("loadingdone", syncLayout);
    };
  }, []);

  useLayoutEffect(syncScroll, [value]);

  return (
    <div className="weighted-prompt-input">
      <div ref={mirror} className="prompt-weight-mirror" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={`${segment.start}-${segment.end}`}
            className={`prompt-weight-${segment.kind} prompt-weight-${segment.tone}`}
          >
            {segment.text}
          </span>
        ))}
        {/* Preserve a terminal newline's last visual line while scrolling. */}
        {String(value).endsWith("\n") ? "\u200b" : null}
      </div>
      <textarea
        {...props}
        ref={input}
        value={value}
        aria-autocomplete={suggestionMode!=='off'?'list':undefined}
        aria-controls={suggestions.shown?suggestionId:undefined}
        aria-expanded={suggestionMode!=='off'?suggestions.shown:undefined}
        aria-activedescendant={suggestions.shown&&suggestions.items.length?`${suggestionId}-${suggestions.active}`:undefined}
        onChange={event=>{props.onChange?.(event);suggestions.capture();}}
        onBlur={event=>{suggestions.dismiss();props.onBlur?.(event);}}
        onMouseUp={event=>{suggestions.capture();props.onMouseUp?.(event);}}
        onKeyUp={event=>{if(!event.ctrlKey&&!event.metaKey&&!['ArrowUp','ArrowDown','Enter','Escape','Tab'].includes(event.key))suggestions.capture();props.onKeyUp?.(event);}}
        onCompositionStart={event=>{suggestions.composing.current=true;suggestions.dismiss();props.onCompositionStart?.(event);}}
        onCompositionEnd={event=>{suggestions.composing.current=false;props.onCompositionEnd?.(event);suggestions.capture();}}
        onKeyDown={event=>{
          if(suggestions.keyDown(event))return;
          if((event.ctrlKey||event.metaKey)&&!event.altKey&&!suggestions.composing.current&&!event.isComposing&&!event.nativeEvent?.isComposing&&event.keyCode!==229&&['ArrowUp','ArrowDown'].includes(event.key)){
            const el=input.current,result=adjustPromptWeight(el.value,el.selectionStart,el.selectionEnd,event.key==='ArrowUp'?1:-1);
            if(result){event.preventDefault();const scroll=el.scrollTop;
              let left=0;while(left<el.value.length&&left<result.text.length&&el.value[left]===result.text[left])left++;
              let rightOld=el.value.length,rightNew=result.text.length;while(rightOld>left&&rightNew>left&&el.value[rightOld-1]===result.text[rightNew-1]){rightOld--;rightNew--;}
              el.setSelectionRange(left,rightOld);
              // execCommand keeps the browser's native undo transaction for textarea edits.
              if(!document.execCommand('insertText',false,result.text.slice(left,rightNew))){el.setRangeText(result.text.slice(left,rightNew),left,rightOld,'end');props.onChange?.({target:el,currentTarget:el});}
              requestAnimationFrame(()=>{el.setSelectionRange(result.start,result.end);el.scrollTop=scroll;syncScroll();});
            }
          }
          onKeyDown?.(event);
        }}
        onScroll={(event) => {
          syncScroll();
          onScroll?.(event);
        }}
      />
      <TagSuggestions suggestions={suggestions} id={suggestionId} targetId={suggestionTarget} label={props['aria-label']||'提示词'}/>
    </div>
  );
});

export default WeightedPromptInput;
