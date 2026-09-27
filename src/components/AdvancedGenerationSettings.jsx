import {Select, Slider, Toggle, JsonField} from './Fields';
import AdvancedFields from './AdvancedFields';
export default function AdvancedGenerationSettings({state:s,update,onJSON}) {
 return <div className="generation-advanced">
      <details>
        <summary>高级采样与输出</summary>
        <Slider
          label="PGR · Prompt Guidance Rescale"
          tooltip="重新缩放提示词引导，缓解高 Guidance 带来的过度饱和与生硬边缘。"
          value={s.cfg_rescale}
          onChange={(v) => update("cfg_rescale", v)}
        />
        <Toggle
          label="原生流式生成"
          checked={s.stream}
          onChange={(v) => update("stream", v)}
          help="接收原生进度事件，保存最终图像及原始流。"
        />
        <Select
          label="返回格式"
          value={s.output}
          options={["b64_json", "url"]}
          onChange={(v) => update("output", v)}
        />
        <p className="hint">
          参数按当前模型显示；V4.5 的参考图请在专用栏目设置。V5 不发送参考图参数。
        </p>
      </details>
      <details>
        <summary>
          专家参数 · 上游完整 schema
          {Object.keys(s.overrides).length > 0
            ? ` (${Object.keys(s.overrides).length} 已覆盖)`
            : ""}
        </summary>
        <p className="parameter-explanation">
          把上游 API
          字段做成表单。勾选后会覆盖普通面板的同名参数；普通生图通常无需修改，且部分字段不适用于
          当前模型。
        </p>
        <AdvancedFields
          model={s.model}
          values={s.overrides}
          onChange={(v) => update("overrides", v)}
        />
      </details>
      <details>
        <summary>扩展参数 JSON</summary>
        <p className="parameter-explanation">
          直接输入参数对象，适合新增字段或批量设置。优先级最高：普通面板 →
          专家参数 → 此处 JSON。留空对象 {"{}"} 即不覆盖。
        </p>
        <JsonField
          label="novelai.parameters 等价覆盖"
          value={s.extraJSON}
          onChange={(v) => update("extraJSON", v)}
          help="最终合并到 native body.parameters，优先级最高，支持未来字段。"
        />
      </details>
      {Object.keys(s.quarantinedParameters || {}).length > 0 && (
        <details className="quarantined-parameters">
          <summary>
            已隔离的旧参数 · {Object.keys(s.quarantinedParameters).length} 项
          </summary>
          <p className="parameter-explanation">
            这些字段不在当前生成接口的参数表中，或是官方客户端会移除的调试信息。原值保留在这里，避免影响生图；提示词和正常参数未被清空。
          </p>
          <pre>{JSON.stringify(s.quarantinedParameters, null, 2)}</pre>
        </details>
      )}
<button className="wide request-button" onClick={onJSON}>查看完整请求 JSON</button>
</div>;
}
