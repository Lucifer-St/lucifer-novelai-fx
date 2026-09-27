import PromptLayoutSettings from './PromptLayoutSettings';
import AdvancedGenerationSettings from './AdvancedGenerationSettings';
import { useEffect, useState } from "react";
import { loadImage } from "../lib/image.mjs";
import { WandSparkles, Code2 } from "lucide-react";
import { schema, b64, parseObject, safePreview } from "../lib/request.mjs";
import { NumberField, Select, Slider, Toggle, JsonField } from "./Fields";
import ImageInput from "./ImageInput";
const toolNames = {
  "bg-removal": "移除背景",
  lineart: "提取线稿",
  sketch: "素描",
  colorize: "上色",
  emotion: "表情修改",
  declutter: "简化画面",
  "declutter-keep-bubbles": "简化 · 保留气泡（实验）",
};
export default function ToolsPanel({
  generationState, updateGeneration, onGenerationJSON, generationTarget,
  promptLayout, onPromptLayout, promptLayoutError,
  model,
  onSubmit,
  busy,
  onError,
  source,
  onSource,
  initialPayload,
  result,
  onInspect,
}) {
  const [tool, setTool] = useState("upscale"),
    [meta, setMeta] = useState({ width: 1024, height: 1024 }),
    [reqType, setReqType] = useState("bg-removal"),
    [prompt, setPrompt] = useState(""),
    [defry, setDefry] = useState(0),
    [sigma, setSigma] = useState("0.3"),
    [emotion, setEmotion] = useState("neutral"),
    [extra, setExtra] = useState("{}"),
    [raw, setRaw] = useState(false),
    [expert, setExpert] = useState(""),
    [tab, setTab] = useState("tools"),
    [native, setNative] = useState(false),
    [nativeRoute, setNativeRoute] = useState("/user/subscription");
  useEffect(() => {
    let active = true;
    if (source)
      loadImage(source)
        .then((img) => {
          if (active)
            setMeta({ width: img.naturalWidth, height: img.naturalHeight });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [source]);
  let payload,
    previewError = "";
  try {
    let body, endpoint;
    if (tool === "upscale") {
      endpoint = "/ai/upscale";
      body = { image: b64(source), model, declared_blur_sigma: Number(sigma) };
    } else if (tool === "augment") {
      endpoint = "/ai/augment-image";
      body = {
        image: b64(source),
        width: meta.width,
        height: meta.height,
        req_type: reqType,
        prompt: reqType === "emotion" ? `${emotion};;${prompt}` : prompt,
        defry: Number(defry),
      };
    }

    Object.assign(body, parseObject(extra, "工具扩展参数"));
    payload = {
      model,
      response_format: "b64_json",
      novelai: { endpoint, body, ...(raw ? { response: "raw" } : {}) },
    };
  } catch (e) {
    previewError = e.message;
  }
  function run() {
    try {
      if (tab === "api") {
        const body = parseObject(expert, "完整请求");
        if (!native && body.novelai?.body?.parameters?.seed === -1)
          throw new Error(
            "API 工作台需要明确的 seed；请使用生成模板分配随机值。",
          );
        onSubmit(
          body,
          native ? { native: true, route: nativeRoute } : undefined,
        );
        return;
      }
      if (previewError) throw new Error(previewError);
      if (!payload.novelai.body.image)
        throw new Error("请先上传工具输入图像。");
      onSubmit(payload);
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <div className="tools-workspace">
      <div className="tools-heading">
        <div>
          <h2>图像工具与 API 工作台</h2>
          <p>使用已配置的接口处理图像，或检查完整请求。</p>
        </div>
        <div className="segment">
          <button className={tab === "layout" ? "selected" : ""} onClick={() => setTab("layout")}>工作区布局</button>
          <button className={tab === "generation" ? "selected" : ""} onClick={() => setTab("generation")}>生成高级设置</button>
          <button
            className={tab === "tools" ? "selected" : ""}
            onClick={() => setTab("tools")}
          >
            <WandSparkles size={15} /> 图像工具
          </button>
          <button
            className={tab === "api" ? "selected" : ""}
            onClick={() => {
              setTab("api");
              if (!expert) {
                const p = structuredClone(initialPayload);
                if (p.novelai?.body?.parameters?.seed === -1)
                  p.novelai.body.parameters.seed = crypto.getRandomValues(
                    new Uint32Array(1),
                  )[0];
                setExpert(JSON.stringify(p, null, 2));
              }
            }}
          >
            <Code2 size={15} /> API 工作台
          </button>
        </div>
      </div>
      {tab === "layout" ? <PromptLayoutSettings value={promptLayout} onChange={onPromptLayout} error={promptLayoutError}/> : tab === "generation" ? <section className="generation-settings-workspace">
        <h3>生成高级设置 · {generationTarget} 方案</h3>
        <p className="hint">与创作页共用当前方案。修改后返回创作继续生成。</p>
        <AdvancedGenerationSettings state={generationState} update={updateGeneration} onJSON={onGenerationJSON}/>
      </section> : tab === "tools" ? (
        <div className="tool-columns">
          <div>
            <Select
              label="工具"
              value={tool}
              onChange={setTool}
              options={[
                { value: "upscale", label: "图像放大 · Upscale" },
                { value: "augment", label: "图像编辑 · Director Tools" },
              ]}
            />
            <ImageInput
              label="工具输入图像"
              onInspect={onInspect}
              value={source}
              onChange={(v, m) => {
                onSource(v);
                if (m) setMeta(m);
              }}
            />
            {tool === "upscale" && (
              <>
                <Select
                  label="模糊估计 declared_blur_sigma"
                  value={sigma}
                  onChange={setSigma}
                  options={schema.toolGuidance.upscaleBlurSigmaValues.map((v) =>
                    String(v),
                  )}
                />
                <p className="hint">
                  使用当前官方模型放大接口。此版本请求字段为
                  image、model、declared_blur_sigma。
                </p>
              </>
            )}
            {tool === "augment" && (
              <>
                <Select
                  label="Director Tool"
                  value={reqType}
                  onChange={setReqType}
                  options={Object.entries(toolNames).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                {reqType === "emotion" && (
                  <Select
                    label="表情 Emotion"
                    value={emotion}
                    options={schema.toolGuidance.emotions}
                    onChange={setEmotion}
                  />
                )}
                <div className="dimensions">
                  <NumberField
                    label="图像宽度"
                    value={meta.width}
                    onChange={(v) => setMeta((m) => ({ ...m, width: v }))}
                  />
                  <NumberField
                    label="图像高度"
                    value={meta.height}
                    onChange={(v) => setMeta((m) => ({ ...m, height: v }))}
                  />
                </div>
                <Slider
                  label="编辑力度 Defry"
                  min={0}
                  max={5}
                  step={1}
                  value={defry}
                  onChange={setDefry}
                />
                <label>
                  附加提示词
                  <textarea
                    aria-label="工具附加提示词"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </label>
              </>
            )}
            <details>
              <summary>工具扩展参数</summary>
              <JsonField
                label="工具 body 覆盖"
                value={extra}
                onChange={setExtra}
              />
              <Toggle label="返回原生响应" checked={raw} onChange={setRaw} />
            </details>
          </div>
          <div className="tool-preview">
            <h3>请求预览</h3>
            <pre>{previewError || safePreview(payload)}</pre>
          </div>
        </div>
      ) : (
        <div className="api-workspace">
          <p className="hint">
            填写含 novelai.body 的完整请求。官方与原生协议发送 body；OpenAI 兼容协议发送完整封装。模板覆盖 V5 Full 图像端点。
          </p>
          <div className="api-templates">
            {schema.operations
              .filter((op) => !["encode-vibe", "tags"].includes(op.id))
              .map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setNative(false);
                    if (op.id === "generate" || op.id === "stream") {
                      const p = structuredClone(initialPayload);
                      if (p.novelai?.body?.parameters?.seed === -1)
                        p.novelai.body.parameters.seed = crypto.getRandomValues(
                          new Uint32Array(1),
                        )[0];
                      p.novelai.endpoint = op.endpoint;
                      if (op.requiresRaw) {
                        p.novelai.response = "raw";
                        p.novelai.body.parameters.stream = "sse";
                      }
                      setExpert(JSON.stringify(p, null, 2));
                    } else if (op.id === "tags")
                      setExpert(
                        JSON.stringify(
                          {
                            model,
                            novelai: {
                              endpoint: op.endpoint,
                              response: "raw",
                              query: { model, prompt: "landscape", lang: "en" },
                            },
                          },
                          null,
                          2,
                        ),
                      );
                    else {
                      const props =
                        schema.definitions[op.bodyDefinition]?.properties || {};
                      const body = Object.fromEntries(
                        Object.entries(props).map(([k, s]) => [
                          k,
                          k === "image"
                            ? b64(source)
                            : k === "model"
                              ? model
                              : s.type === "number" || s.type === "integer"
                                ? 0
                                : s.type === "boolean"
                                  ? false
                                  : "",
                        ]),
                      );
                      setExpert(
                        JSON.stringify(
                          {
                            model,
                            response_format: "b64_json",
                            novelai: {
                              endpoint: op.endpoint,
                              body,
                              ...(op.requiresRaw ? { response: "raw" } : {}),
                            },
                          },
                          null,
                          2,
                        ),
                      );
                    }
                  }}
                >
                  {op.name}
                </button>
              ))}
          </div>
          <Toggle
            label="只读查询（不会提交生图）"
            checked={native}
            onChange={(v) => {
              setNative(v);
              if (v) setExpert("{}");
            }}
          />
          {native && (
            <>
              <Select
                label="只读接口"
                value={nativeRoute}
                onChange={setNativeRoute}
                options={["/user/subscription","/v1/models"]}
              />
              <p className="hint">
                官方或原生协议使用订阅接口；OpenAI 兼容协议使用模型列表。接口是否开放由所选服务决定。
              </p>
            </>
          )}
          <JsonField
            label={native ? "只读查询（body 留空对象）" : "完整请求 JSON"}
            value={expert}
            onChange={setExpert}
            rows={22}
          />
          <details>
            <summary>官方请求 schema</summary>
            <pre>
              {JSON.stringify(
                native
                  ? {subscription:"GET /user/subscription",models:"GET /v1/models"}
                  : schema.definitions,
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
      {result && tab !== "generation" && tab !== "layout" && (
        <section className="tool-output">
          <h3>最近请求结果</h3>
          <div>
            {result.images?.map((im) => (
              <a key={im.url} href={im.url} download={im.name}>
                <img src={im.url} alt="工具处理结果" />
              </a>
            ))}
          </div>
          {result.rawUrl && (
            <a href={result.rawUrl} download>
              下载原始响应
            </a>
          )}
          {result.requestUrl && (
            <a href={result.requestUrl} download>
              下载请求 JSON
            </a>
          )}
          {result.warnings?.map((w, i) => (
            <p className="hint" key={i}>
              {w}
            </p>
          ))}
          {!result.images?.length && (
            <pre>
              {(
                result.rawText || JSON.stringify(result.json || result, null, 2)
              ).slice(0, 20000)}
            </pre>
          )}
        </section>
      )}
      {tab !== "generation" && tab !== "layout" && <div className="tool-footer">
        <small>图像工具可能消耗额度；每次点击只提交一次，无自动重试。</small>
        <button className="primary" disabled={busy} onClick={run}>
          {busy ? "请求处理中…" : "执行当前请求"}
        </button>
      </div>}
    </div>
  );
}
