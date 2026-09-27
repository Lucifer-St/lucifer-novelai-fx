import {validCards} from '../lib/prompt-cards.mjs';
import {isV45,modelSpec} from '../lib/model-policy.mjs';
import {characterField,promptElementId} from '../lib/prompt-targets.mjs';
import TagSuggestionSlot from './TagSuggestionSlot';
import PromptCardStrip from './PromptCardStrip';
import { useState, useLayoutEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, Move, ChevronDown, ChevronRight } from "lucide-react";
import { Toggle, NumberField } from "./Fields";
import {applyNegativePreset,negativePresets,qualityPresets,splitNegativePreset} from '../lib/official-presets.mjs';
import WeightedPromptInput from "./WeightedPromptInput";
import "../prompt-layout.css";
export default function PromptPanel({ state: s, update, tab, setTab,cardSelection,savingCard,onSaveCard,onRemoveCard,onCardLibrary,onEditCard,onPickCard,libraryRevision,onReplacePromptRange,suggestionMode,onPosition,illustratedLayout=false, active=true, layout={mode:"classic",characters:{}}, onToggleMain, onToggleCharacter }) {
  const [promptMode, setPromptMode] = useState("positive");
  const [characterModes,setCharacterModes]=useState({});
  const merged=layout.mode==='merged',mainOpen=!merged||!layout.mainCollapsed;
  const negativePreset=splitNegativePreset(s.negative,s.model).preset;
  const contentRef=useRef(null);
  useLayoutEffect(()=>{
    const content=contentRef.current,scroll=content?.closest('.left-scroll');if(!content||!scroll)return;
    // Measure the fixed column, not the card tray, so opening cards never steals
    // editor height. A native drag sets inline height and overrides this default.
    // Illustrated headers keep their approved proportions. Let the left column
    // scroll instead of reducing the useful editor to a few lines beneath them.
    const bounds=illustratedLayout?scroll.closest('.left-panel')||scroll:scroll;
    const resize=()=>{if(!active||!bounds.clientHeight)return;content.style.setProperty('--auto-prompt-height',`${innerWidth<=900?530:Math.max(illustratedLayout?560:500,bounds.clientHeight-(illustratedLayout?170:180)-(suggestionMode==='off'?0:128))}px`);};
    resize();const observer=new ResizeObserver(resize);observer.observe(bounds);window.addEventListener('resize',resize);return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
  },[tab,suggestionMode,illustratedLayout,active]);
  const cardStrip = (owner, field, key, label) => <PromptCardStrip key={field} cards={validCards(owner[key+'Cards'],owner[key])} field={field} label={label} selection={cardSelection} saving={savingCard} onSave={onSaveCard} onRemove={onRemoveCard} onLibrary={onCardLibrary} onEdit={onEditCard} onPick={onPickCard} libraryRevision={libraryRevision} active={active&&(!merged?tab==='characters':!layout.characters?.[owner.id])&&(merged||(characterModes[owner.id]||'prompt')===key)}/>;
  function switchPromptTab(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "positive"
        : event.key === "End"
          ? "negative"
          : promptMode === "positive"
            ? "negative"
            : "positive";
    setPromptMode(next);
    event.currentTarget.parentElement.querySelector(`#${next}-tab`)?.focus();
  }
  const charUpdate = (id, k, v) =>
    update(
      "characters",
      s.characters.map((c) => (c.id === id ? { ...c, [k]: v } : c)),
    );
  return (
    <>
      <div className="tabs" role="tablist" aria-label="提示内容" hidden={merged}>
        {[
          ["prompt", "提示词"],
          ["characters", "角色"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "characters" && s.characters.length > 0 ? (
              <span className="count">{s.characters.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="prompt-content prompt-layout-section" ref={contentRef} hidden={!merged&&tab!=="prompt"}>
          <div className="prompt-layout-heading" hidden={!merged}><button type="button" aria-expanded={mainOpen} aria-controls="main-prompt-editor main-prompt-extras" onClick={onToggleMain}>{mainOpen?<ChevronDown size={16}/>:<ChevronRight size={16}/>}主提示词</button><small>正面 / 负面</small></div>
          <div id="main-prompt-editor" className="prompt-editor" hidden={!mainOpen} title="拖动右下角调整提示词编辑区高度">
            <div
              className="prompt-mode-tabs"
              role="tablist"
              aria-label="正负面提示词"
              hidden={merged}
            >
              <button
                id="positive-tab"
                role="tab"
                aria-selected={promptMode === "positive"}
                aria-controls="positive-panel"
                tabIndex={promptMode === "positive" ? 0 : -1}
                onKeyDown={switchPromptTab}
                onClick={() => setPromptMode("positive")}
              >
                正面 <span>Prompt</span>
              </button>
              <button
                id="negative-tab"
                role="tab"
                aria-selected={promptMode === "negative"}
                aria-controls="negative-panel"
                tabIndex={promptMode === "negative" ? 0 : -1}
                onKeyDown={switchPromptTab}
                onClick={() => setPromptMode("negative")}
              >
                负面 <span>Undesired Content</span>
              </button>
            </div>
            {/* Keep both editors mounted so switching preserves caret and scroll. */}
            <div
              id="positive-panel"
              role="tabpanel"
              aria-labelledby="positive-tab"
              hidden={!merged&&promptMode !== "positive"}
            >
              <h4 className="merged-prompt-label" hidden={!merged}>主正面 Prompt</h4>
              <WeightedPromptInput
                autoResize={merged} active={active&&mainOpen&&(merged||tab==='prompt'&&promptMode==='positive')}
                id="positive"
                onReplaceRange={edit=>onReplacePromptRange?.('prompt',edit)}
                suggestionMode={active&&mainOpen&&(merged||tab==='prompt')?suggestionMode:'off'}
                suggestionTarget="main-tag-suggestions"
                data-prompt-field="prompt"
                aria-label="正面提示词"
                className="positive"
                rows={22}
                placeholder={
                  "描述你想要的画面…\n\n人物、场景、构图、光线与风格，\n也可以拖入图片，继续已有的创作。"
                }
                value={s.prompt}
                spellCheck="false"
                onChange={(e) => update("prompt", e.target.value,e.nativeEvent?.inputType)}
              />
              <div className="prompt-editor-footer">
                <label className="official-preset-control">官方正面预设<select aria-label="官方正面预设" value={qualityPresets(s.model).includes(s.qualityPreset)?s.qualityPreset:'standard'} disabled={!s.quality} onChange={e=>update('qualityPreset',e.target.value)}><option value="standard">Standard · 标准</option>{qualityPresets(s.model).includes('light')&&<option value="light">Light · 轻量</option>}</select></label>
                <small
                  className="prompt-weight-guide"
                  title="蓝色：弱化（小于 1）；琥珀色：强调（大于 1）；绿色：权重边界。支持 0.7::内容::、1.2::内容::、{强调} 和 [弱化]。仅标色，不改变提示词。"
                >
                  0.7::弱化:: · 1.2::强调::
                </small>
                <small>{s.prompt.length} 字符</small>
              </div>
            </div>
            <div
              id="negative-panel"
              role="tabpanel"
              aria-labelledby="negative-tab"
              hidden={!merged&&promptMode !== "negative"}
            >
              <h4 className="merged-prompt-label" hidden={!merged}>主负面 Undesired Content</h4>
              <WeightedPromptInput
                autoResize={merged} active={active&&mainOpen&&(merged||tab==='prompt'&&promptMode==='negative')}
                id="negative"
                onReplaceRange={edit=>onReplacePromptRange?.('negative',edit)}
                suggestionMode={active&&mainOpen&&(merged||tab==='prompt')?suggestionMode:'off'}
                suggestionTarget="main-tag-suggestions"
                data-prompt-field="negative"
                aria-label="负面提示词"
                className="negative"
                rows={22}
                placeholder="描述你希望避免出现的内容…"
                value={s.negative}
                spellCheck="false"
                onChange={(e) => update("negative", e.target.value,e.nativeEvent?.inputType)}
              />
              <div className="prompt-editor-footer">
                <div className="prompt-presets official-preset-controls">
                  <label className="official-preset-control">官方负面预设<select aria-label="官方负面预设" value={negativePreset} onChange={e=>update('negative',applyNegativePreset(s.negative,s.model,e.target.value))} title="替换完整的官方预设前缀，保留后面的自写词；已改写的预设按自写词保留。"><option value="none">None · 仅自写</option>{Object.keys(negativePresets(s.model)).map(id=><option key={id} value={id}>{{heavy:'Heavy · 强',light:'Light · 轻',human:'Human Focus · 人物',furry:'Furry Focus · 兽人'}[id]}</option>)}</select></label>
                  <button
                    className="text-button"
                    onClick={() => update("negative", "")}
                  >
                    清空
                  </button>
                </div>
                <small>{s.negative.length} 字符</small>
              </div>
            </div>
          </div>
          <div id="main-prompt-extras" className="main-prompt-extras" hidden={!mainOpen}>
          <TagSuggestionSlot id="main-tag-suggestions" mode={suggestionMode}/>
          {['prompt','negative'].map(key=><div key={key} hidden={!merged&&promptMode!==(key==='prompt'?'positive':'negative')}><PromptCardStrip label={merged?(key==='prompt'?'本次正面卡片':'本次负面卡片'):undefined} cards={validCards(s[key+'Cards'],s[key])} field={key} selection={cardSelection} saving={savingCard} onSave={onSaveCard} onRemove={onRemoveCard} onLibrary={onCardLibrary} onEdit={onEditCard} onPick={onPickCard} libraryRevision={libraryRevision} active={active&&mainOpen&&(merged||tab==='prompt'&&promptMode===(key==='prompt'?'positive':'negative'))}/></div>)}
          </div>
        </div>
        <div className="characters prompt-layout-section" hidden={!merged&&tab!=="characters"}>
          <p className="hint">
            每个角色独立描述外观与动作。开启坐标后，在中间画布拖动编号即可定位。
          </p>
          <Toggle
            label="使用角色位置坐标"
            checked={s.coords}
            onChange={(v) => update("coords", v)}
          />
          {s.coords&&<button className="wide character-position-entry" onClick={()=>onPosition(s.characters[0]?.id)}><Move size={15}/>在画布中定位</button>}
          {s.characters.map((c, i) => (
            <section className="character" key={c.id}>
              <div className="section-label">
                <strong hidden={merged}><GripVertical size={14} /> 角色 {i + 1}</strong>
                <button type="button" className="character-fold-button" hidden={!merged} aria-expanded={!layout.characters?.[c.id]} aria-controls={`character-body-${c.id}`} onClick={()=>onToggleCharacter?.(c.id)}>{layout.characters?.[c.id]?<ChevronRight size={15}/>:<ChevronDown size={15}/>}角色 {i+1}</button>
                <button
                  title={`移除角色 ${i + 1}`}
                  onClick={() =>
                    update(
                      "characters",
                      s.characters.filter((x) => x.id !== c.id),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <Toggle
                label={`启用角色 ${i + 1}`}
                checked={c.enabled}
                onChange={(v) => charUpdate(c.id, "enabled", v)}
              />
              <div id={`character-body-${c.id}`} className="character-body" hidden={merged&&!!layout.characters?.[c.id]}>
              <div className="prompt-editor character-prompt-editor">
                <div className="prompt-mode-tabs" role="tablist" aria-label={`角色 ${i+1} 正负面提示词`} hidden={merged}>
                  {['prompt','negative'].map(mode=><button key={mode} id={`role-${c.id}-${mode}-tab`} role="tab" aria-selected={(characterModes[c.id]||'prompt')===mode} aria-controls={`role-${c.id}-${mode}-panel`} tabIndex={(characterModes[c.id]||'prompt')===mode?0:-1} onClick={()=>setCharacterModes(m=>({...m,[c.id]:mode}))} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'prompt':event.key==='End'?'negative':mode==='prompt'?'negative':'prompt';setCharacterModes(m=>({...m,[c.id]:next}));document.getElementById(`role-${c.id}-${next}-tab`)?.focus();}}>{mode==='prompt'?<>正面 <span>Prompt</span></>:<>负面 <span>Undesired Content</span></>}</button>)}
                </div>
                {['prompt','negative'].map(mode=><div key={mode} id={`role-${c.id}-${mode}-panel`} role="tabpanel" aria-labelledby={`role-${c.id}-${mode}-tab`} hidden={!merged&&(characterModes[c.id]||'prompt')!==mode}>
                  <h4 className="merged-prompt-label" hidden={!merged}>{mode==='prompt'?'正面 Prompt':'负面 Undesired Content'}</h4>
                  <WeightedPromptInput autoResize active={active&&(!merged?tab==='characters':!layout.characters?.[c.id])&&(merged||(characterModes[c.id]||'prompt')===mode)} id={promptElementId(characterField(c.id,mode))} onReplaceRange={edit=>onReplacePromptRange?.(characterField(c.id,mode),edit)} suggestionMode={active&&(!merged?tab==='characters':!layout.characters?.[c.id])?suggestionMode:'off'} suggestionTarget={`role-${c.id}-suggestions`} data-prompt-field={characterField(c.id,mode)} aria-label={`角色 ${i+1} ${mode==='prompt'?'正面':'负面'}提示词`} rows={3} placeholder={mode==='prompt'?'描述这个角色的外观、服装与动作…':'描述这个角色需要避免出现的内容…'} value={c[mode]} onChange={e=>update(characterField(c.id,mode),e.target.value,e.nativeEvent?.inputType)}/>
                  <div className="prompt-editor-footer"><small>随内容伸缩 · 也可拖动调整</small><small>{c[mode].length} 字符</small></div>
                </div>)}
              </div>
              <TagSuggestionSlot id={`role-${c.id}-suggestions`} mode={suggestionMode} compact/>
              {['prompt','negative'].map(mode=><div key={mode} hidden={!merged&&(characterModes[c.id]||'prompt')!==mode}>{cardStrip(c,characterField(c.id,mode),mode,`角色 ${i+1} ${mode==='negative'?'负面':'正面'}卡片`)}</div>)}
              {s.coords && <div className="character-position-fine">
                <button className="wide" onClick={()=>onPosition(c.id)}><Move size={14}/>在画布中定位角色 {i+1}</button>
                {isV45(s.model)?<div className="coordinate-fields">{['x','y'].map(axis=><label key={axis}>{`角色 ${i+1} ${axis.toUpperCase()}`}<select aria-label={`角色 ${i+1} ${axis.toUpperCase()}`} value={c[axis]} onChange={e=>charUpdate(c.id,axis,Number(e.target.value))}>{[.1,.3,.5,.7,.9].map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}</div>:<div className="coordinate-fields"><NumberField label={`角色 ${i+1} X`} value={c.x} min={0} max={1} step={.001} onChange={v=>charUpdate(c.id,'x',Math.max(0,Math.min(1,Number(v)||0)))}/><NumberField label={`角色 ${i+1} Y`} value={c.y} min={0} max={1} step={.001} onChange={v=>charUpdate(c.id,'y',Math.max(0,Math.min(1,Number(v)||0)))}/></div>}
              </div>}
              </div>
            </section>
          ))}
          <button
            className="wide"
            disabled={s.characters.filter(c=>c.enabled!==false).length>=modelSpec(s.model).webCapabilities.maxCharacters}
            onClick={() =>
              update("characters", [
                ...s.characters,
                {
                  id: crypto.randomUUID(),
                  prompt: "",
                  negative: "",
                  x: 0.5,
                  y: 0.5,
                  enabled: true,
                },
              ])
            }
          >
            <Plus size={16} /> 添加角色
          </button>
        </div>
    </>
  );
}
