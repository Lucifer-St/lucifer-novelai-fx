import {useState} from 'react';
import {changeGenerationMode} from '../lib/generation-mode.mjs';
import { ArrowLeftRight, Dices } from "lucide-react";
import { NumberField, Select, Slider, Toggle } from "./Fields";
import {isV45,modelSpec} from '../lib/model-policy.mjs';
import ReferencePanel from './ReferencePanel';

const sizes = [
  [832, 1216, "标准 · 竖图"],
  [1216, 832, "标准 · 横图"],
  [1024, 1024, "标准 · 方图"],
  [512, 768, "小 · 竖图"],
  [768, 512, "小 · 横图"],
  [1536, 1024, "大 · 横图"],
  [1024, 1536, "大 · 竖图"],
];
const samplers = [
  "k_euler_ancestral",
  "k_euler",
  "k_dpmpp_2s_ancestral",
  "k_dpmpp_2m_sde",
  "k_dpmpp_2m",
  "k_dpmpp_sde",
];

export default function SettingsPanel({ state: s, update, setState, onJSON, comparisonEnabled=false,suggestionMode='off',onSuggestionMode,onToggleSuggestions }) {
  const [settingsTab,setSettingsTab]=useState("parameters");
  const referenceTab=isV45(s.model)&&settingsTab==="reference";
  const setSize = (width, height) => setState((v) => ({ ...v, width, height }));
  let extension = {};
  try { extension = JSON.parse(s.extraJSON || '{}'); } catch { /* Keep invalid expert text for correction. */ }
  const transparentKey = 'tag_hint_transparent_background';
  const transparent = extension?.[transparentKey] ?? s.overrides[transparentKey];
  const setTransparent = value => setState(old => {
    let extraJSON = old.extraJSON;
    try {
      const extra = JSON.parse(extraJSON || '{}');
      if (extra && Object.hasOwn(extra, transparentKey)) extraJSON = JSON.stringify({...extra,[transparentKey]:value},null,2);
    } catch { /* The normal request validation still blocks malformed JSON. */ }
    return {...old,extraJSON,overrides:{...old.overrides,[transparentKey]:value}};
  });
  const knownSize = sizes.some(([w, h]) => w === s.width && h === s.height);
  return (
    <>
      <div className="segment" role="group" aria-label="生成模式">
        {[
          ["generate", "文生图"],
          ["img2img", "图生图"],
          ["infill", "局部重绘"],
        ].map(([v, n]) => (
          <button
            key={v}
            className={s.mode === v ? "selected" : ""}
            aria-pressed={s.mode === v}
            onClick={() =>
              setState(state => changeGenerationMode(state,v))
            }
          >
            {n}
          </button>
        ))}
      </div>
      {s.mode === "infill" && (
        <small className="compatibility-note">
          使用 {modelSpec(s.model).name} Inpainting。白色区域重新生成，其余保留。
        </small>
      )}
      {isV45(s.model)&&<div className="segment" role="group" aria-label="V4.5 设置栏目"><button type="button" aria-pressed={!referenceTab} className={!referenceTab?"selected":""} onClick={()=>setSettingsTab("parameters")}>参数</button><button type="button" aria-pressed={referenceTab} className={referenceTab?"selected":""} onClick={()=>setSettingsTab("reference")}>参考图</button></div>}
      {referenceTab&&<ReferencePanel state={s} setState={setState}/>}
      <div hidden={referenceTab}>
      <section>
        <div className="section-label">
          <h3>图像尺寸</h3>
          <span>
            {((Number(s.width) * Number(s.height)) / 1e6).toFixed(2)} MP
          </span>
        </div>
        <Select
          label="尺寸预设"
          value={knownSize ? `${s.width}x${s.height}` : "custom"}
          onChange={(v) => {
            if (v !== "custom") {
              const [w, h] = v.split("x").map(Number);
              setSize(w, h);
            }
          }}
          options={[
            { value: "custom", label: "自定义" },
            ...sizes.map(([w, h, n]) => ({
              value: `${w}x${h}`,
              label: `${n} ${w} × ${h}`,
            })),
          ]}
        />
        <div className="dimensions">
          <NumberField
            label="宽度"
            value={s.width}
            min={64}
            max={4096}
            step={64}
            onChange={(v) => update("width", v)}
          />
          <button title="交换宽高" onClick={() => setSize(s.height, s.width)}>
            <ArrowLeftRight size={16} />
          </button>
          <NumberField
            label="高度"
            value={s.height}
            min={64}
            max={4096}
            step={64}
            onChange={(v) => update("height", v)}
          />
        </div>
        {!comparisonEnabled?<NumberField
          label="生成数量"
          min={1}
          max={8}
          value={s.n}
          onChange={(v) => update("n", v)}
        />:<p className="hint">对照模式每个方案生成 1 张；总量由对照轮数决定。</p>}
      </section>
      <div className="advanced-creation-fields"><section>
        <Slider
          label="采样步数 Steps"
          value={s.steps}
          min={1}
          max={150}
          step={1}
          onChange={(v) => update("steps", v)}
        />
        <Slider
          label="引导强度 Guidance"
          value={s.scale}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => update("scale", v)}
        />
        <Slider label="PGR · Prompt Guidance Rescale" value={s.cfg_rescale} min={0} max={1} step={0.01} onChange={v=>update("cfg_rescale",v)} tooltip="重新缩放提示词引导，缓解高 Guidance 带来的过度饱和与生硬边缘。"/>
        <Select
          label="采样器 Sampler"
          value={s.sampler}
          options={samplers}
          onChange={(v) => update("sampler", v)}
        />
        {isV45(s.model)?<Select label="噪声调度" value={s.noise_schedule} options={['native','karras','exponential','polyexponential']} onChange={v=>update('noise_schedule',v)}/>:<div className="fixed-schedule">
          <span>噪声调度</span>
          <code>Karras</code>
          <small>V5 官方固定调度</small>
        </div>}
        <div className="seed-row">
          <NumberField
            label="随机种子 Seed"
            min={-1}
            max={4294967295}
            value={s.seed}
            onChange={(v) => update("seed", v)}
          />
          <button
            title="恢复随机种子（-1）"
            aria-label="恢复随机种子（-1）"
            onClick={() => update("seed", -1)}
          >
            <Dices size={17} />
          </button>
        </div>
        <small>-1 每次随机；实际 seed 会保存在请求记录。</small>
      </section>
      {s.mode !== "generate" && (
        <section>
          <Slider
            label="变化强度 Strength"
            value={s.strength}
            onChange={(v) => update("strength", v)}
          />
          <Slider
            label="噪声 Noise"
            value={s.noise}
            onChange={(v) => update("noise", v)}
          />
        </section>
      )}
      {!isV45(s.model)&&<Toggle
        label="Transparent BG · 透明背景"
        checked={!!transparent}
        onChange={setTransparent}
        help="提交时添加 transparent background，保留编辑区原文；手写的透明背景标签不会自动移除。"
      />}
      {!isV45(s.model)&&<details className="v5-text-settings"><summary>画面文字 · V5</summary><label htmlFor="v5-image-text">需要画在图中的文字</label><textarea id="v5-image-text" value={s.imageText||''} onChange={e=>update('imageText',e.target.value)} placeholder="原文会加入最终 Text: 区块"/><Toggle label="提取引号内文字" checked={s.autoText} onChange={v=>update('autoText',v)} help="生成前整理成 Text:，不改写编辑区原文；手写 Text: 时以手写内容为准。"/></details>}
      </div>
<section className="suggestion-settings">
        <Toggle label="开启关联词建议" checked={suggestionMode!=='off'} onChange={onToggleSuggestions} help="候选显示在 Prompt 下方，不遮挡正文。"/>
        {suggestionMode!=='off'&&<><Select label="标签建议模式" value="local" onChange={onSuggestionMode} options={[{value:'local',label:'仅本地 Danbooru · 不调用网关'}]}/><p className="hint">分享版使用随包本地词表；补全不提交 API 请求。</p></>}
      </section>
      </div>
      <button className="wide request-button" onClick={onJSON}>
        查看完整请求 JSON
      </button>
    </>
  );
}
