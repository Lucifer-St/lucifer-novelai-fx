import schema from "../../shared/schema.json" with { type: "json" };
import {DEFAULT_MODEL,modelSpec,isV45,isReferenceParameter,validateModelPayload} from './model-policy.mjs';
import {compilePrompt} from './prompt-text.mjs';
import {qualitySuffix,splitQualityPrompt,splitNegativePreset,officialPresetHint} from './official-presets.mjs';
import {
  PARAMETER_POLICY_VERSION,
  partitionParameters,
  explicitParameters,
  recoverParameterState,
} from "./parameter-policy.mjs";

export { schema };
export const MODEL_ID = DEFAULT_MODEL;
export const b64 = (value) =>
  typeof value === "string" && value.startsWith("data:")
    ? value.slice(value.indexOf(",") + 1)
    : value;
export const newSeed = () =>
  globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const omit = (object, keys) =>
  Object.fromEntries(
    Object.entries(object || {}).filter(([key]) => !keys.includes(key)),
  );
export function defaults(model = MODEL_ID) {
  const spec = modelSpec(model),
    p = spec.defaultParameters;
  return {
    model: spec.id,
    mode: "generate",
    prompt: "",
    promptCards: [],
    negativeCards: [],
    negative: spec.negativePrompt,
    width: p.width,
    height: p.height,
    steps: p.steps,
    scale: p.scale,
    n: p.n_samples,
    seed: -1,
    sampler: p.sampler,
    noise_schedule: p.noise_schedule,
    quality: true,
    qualityPreset: 'standard',
    cfg_rescale: p.cfg_rescale ?? 0,
    strength: 0.7,
    noise: 0,
    coords: false,
    characters: [],
    vibes: [],
    precise: [],
    referenceMode: 'off',
    autoText: false,
    imageText: '',
    normalize: true,
    source: "",
    mask: "",
    nativeModel: spec.inpaintingModel,
    overrides: {},
    extraJSON: "{}",
    stream: false,
    output: "b64_json",
    parameterPolicyVersion: PARAMETER_POLICY_VERSION,
    quarantinedParameters: {},
  };
}
export function parseObject(text, label = "JSON") {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label} 格式错误：${e.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 JSON 对象`);
  return value;
}
function rejectIncomplete(value, path = "参数") {
  if (!value || typeof value !== "object") return;
  if (has(value, "__studioInvalidJSON"))
    throw new Error(`${path} 的 JSON 尚未完成或格式无效，请修正后再生成。`);
  for (const [key, item] of Object.entries(value))
    rejectIncomplete(item, `${path}.${key}`);
}
function condition(base, state, negative = false) {
  const original = state.conditions?.[negative ? "negative" : "positive"] || {};
  const coords =
    negative &&
    state.originalCoords === state.coords &&
    has(original, "use_coords")
      ? original.use_coords
      : !!state.coords;
  return {
    ...original,
    use_coords: coords,
    use_order: original.use_order ?? true,
    caption: {
      ...original.caption,
      base_caption: base,
      char_captions: state.characters
        .filter((c) => c.enabled !== false)
        .map((c) => {
          const caption =
              c[negative ? "negativeCaption" : "positiveCaption"] || {},
            existing = caption.centers || [];
          const unchanged =
            c.originalPosition &&
            Number(c.x) === c.originalPosition.x &&
            Number(c.y) === c.originalPosition.y;
          const centers =
            unchanged && existing.length
              ? existing
              : [
                  { ...existing[0], x: Number(c.x), y: Number(c.y) },
                  ...existing.slice(1),
                ];
          return {
            ...caption,
            char_caption: negative ? c.negative : c.prompt,
            centers,
          };
        }),
    },
  };
}
export function buildRequest(state, { resolveSeed = false } = {}) {
  const s = state,
    spec = modelSpec(s.model);
  if (typeof s.prompt !== "string") throw new Error("正面提示词必须是文本。");
  const explicit = {
    ...partitionParameters(s.overrides || {}).accepted,
    ...explicitParameters(parseObject(s.extraJSON || "{}", "扩展参数")),
  };
  rejectIncomplete(explicit);
  if(isV45(s.model)){
    const referenceKeys=Object.keys(explicit).filter(isReferenceParameter);
    if(referenceKeys.length&&(!s.referenceMode||s.referenceMode==='off'))throw Error('参考图已关闭，请先选择参考图模式或移除专家 JSON 中的参考图参数。');
    if(referenceKeys.some(key=>s.referenceMode==='precise'?!key.startsWith('director_reference_'):key.startsWith('director_reference_')))throw Error('专家 JSON 中的参考图参数与当前参考图模式不一致。');
  }
  const p = {
    ...spec.defaultParameters,
    params_version: spec.defaultParameters.params_version,
    width: Number(s.width),
    height: Number(s.height),
    steps: Number(s.steps),
    scale: Number(s.scale),
    n_samples: Number(s.n),
    sampler: s.sampler,
    noise_schedule: s.noise_schedule,
    seed: Number(s.seed),
    cfg_rescale: Number(s.cfg_rescale),
    qualityToggle: !!s.quality,
    negative_prompt: s.negative,
  };
  if (s.mode !== "generate") {
    p.image = b64(s.source);
    p.strength = Number(s.strength);
    p.noise = Number(s.noise);
  }
  if (s.mode === "infill") {
    p.mask = b64(s.mask);
    p.img2img = {
      ...s.infillParameters,
      strength: Number(s.strength),
      noise: Number(s.noise),
    };
  }
  if(isV45(s.model)){
    if(s.referenceMode==='precise'){
      const refs=(s.precise||[]).filter(ref=>ref.enabled!==false&&ref.image);
      if(refs.length){
        p.director_reference_images=refs.map(ref=>b64(ref.image));
        p.director_reference_descriptions=refs.map(ref=>({caption:{base_caption:ref.type||'character',char_captions:[]},legacy_uc:false}));
        p.director_reference_information_extracted=refs.map(()=>1);
        p.director_reference_strength_values=refs.map(ref=>Number(ref.strength??1));
        p.director_reference_secondary_strength_values=refs.map(ref=>1-Number(ref.fidelity??1));
      }
    }else if(s.referenceMode==='vibe'){
      const refs=(s.vibes||[]).filter(ref=>ref.enabled!==false&&(ref.image||ref.encoding));
      if(refs.some(ref=>!ref.encoding||ref.encodedModel!==spec.id||ref.encodedInformation!==Number(ref.information??1)))throw Error('Vibe 图片尚未编码，或模型／信息量已改变；请在参考图栏明确点击编码。');
      if(refs.length){
        p.reference_image_multiple=refs.map(ref=>ref.encoding);
        p.reference_strength_multiple=refs.map(ref=>Number(ref.strength??.6));
        p.reference_information_extracted_multiple=refs.map(ref=>Number(ref.information??1));
        p.normalize_reference_strength_multiple=!!s.normalize;
      }
    }
  }
  // Scalar overrides are applied before captions and quality tags are derived.
  Object.assign(p, explicit);
  const suffix=p.qualityToggle?qualitySuffix(spec.id,s.qualityPreset):'';
  const prompt = spec.v5?compilePrompt(s.prompt,{qualitySuffix:suffix,transparent:p.tag_hint_transparent_background,imageText:s.imageText||'',autoText:s.autoText}):s.prompt+(suffix&&!s.prompt.endsWith(suffix)?suffix:'');
  if (!has(explicit, "v4_prompt")) p.v4_prompt = condition(prompt, s);
  if (!has(explicit, "v4_negative_prompt"))
    p.v4_negative_prompt = condition(p.negative_prompt, s, true);
  if (spec.v5&&!has(explicit, "tag_hint_qt")) p.tag_hint_qt = p.qualityToggle ? officialPresetHint(s.qualityPreset==='light'?'light':'standard') : 0;
  if (spec.v5&&!has(explicit, "tag_hint_uc_preset")) p.tag_hint_uc_preset = officialPresetHint(splitNegativePreset(p.negative_prompt,spec.id).preset);
  if (p.seed === -1 && resolveSeed) p.seed = newSeed();
  const model = s.mode === "infill" ? spec.inpaintingModel : spec.id;
  const body = {
    ...s.nativeBodyExtras,
    model,
    input: prompt,
    action: s.mode,
    parameters: p,
  };
  const native = {
    endpoint: s.stream ? "/ai/generate-image-stream" : "/ai/generate-image",
    body,
  };
  if (s.stream) {
    native.response = "raw";
    p.stream = p.stream || "sse";
  }
  if (p.image_format === "webp") native.response = "raw";
  return validateModelPayload({ model: spec.id, response_format: s.output, novelai: native });
}
function validateType(value, definition, path) {
  if (!definition) return;
  if (definition.$ref)
    return validateType(
      value,
      schema.definitions[definition.$ref.split("/").at(-1)],
      path,
    );
  for (const part of definition.allOf || []) validateType(value, part, path);
  const type = definition.type;
  const valid =
    type === "array"
      ? Array.isArray(value)
      : type === "object"
        ? !!value && typeof value === "object" && !Array.isArray(value)
        : type === "integer"
          ? Number.isInteger(value)
          : type === "number"
            ? Number.isFinite(value)
            : type === "string"
              ? typeof value === "string"
              : type === "boolean"
                ? typeof value === "boolean"
                : true;
  if (!valid) throw new Error(`${path} 类型错误，应为 ${type}。`);
  if (type === "array")
    value.forEach((item, i) =>
      validateType(item, definition.items, `${path}[${i}]`),
    );
  if (type === "object") {
    for (const required of definition.required || [])
      if (!has(value, required))
        throw new Error(`${path}.${required} 不能为空。`);
    for (const [key, item] of Object.entries(value))
      validateType(item, definition.properties?.[key], `${path}.${key}`);
  }
  if (
    typeof value === "number" &&
    ((definition.minimum !== undefined && value < definition.minimum) ||
      (definition.maximum !== undefined && value > definition.maximum))
  )
    throw new Error(`${path} 超出接口允许的范围。`);
}
export function validateRequest(state, payload) {
  validateModelPayload(payload);
  const body = payload.novelai.body,
    p = body.parameters;
  rejectIncomplete(p);
  for (const [key, value] of Object.entries(p))
    validateType(value, schema.imageParameters[key], key);
  const customCaption =
    has(state.overrides || {}, "v4_prompt") ||
    has(parseObject(state.extraJSON || "{}", "扩展参数"), "v4_prompt");
  if (
    !String(state.prompt || "").trim() &&
    !(customCaption && String(p.v4_prompt?.caption?.base_caption || "").trim())
  )
    throw new Error("请先填写正面提示词。");
  for (const key of ["width", "height"])
    if (
      !Number.isInteger(p[key]) ||
      p[key] < 64 ||
      p[key] > 4096 ||
      p[key] % 64
    )
      throw new Error("宽高须为 64–4096 之间的 64 倍数。");
  if (!Number.isInteger(p.n_samples) || p.n_samples < 1 || p.n_samples > 8)
    throw new Error("图像数量须为 1–8；模型可能有更严格限制。");
  if (!Number.isFinite(p.steps) || p.steps < 1)
    throw new Error("采样步数必须是至少为 1 的有效数字。");
  if (!Number.isFinite(p.scale) || p.scale < 0)
    throw new Error("Guidance 必须是非负有效数字。");
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295)
    throw new Error("Seed 应为 0–4294967295，或在界面使用 -1 随机生成。");
  if (body.action !== "generate" && !p.image) throw new Error("请上传源图像。");
  if (body.action === "infill" && (!p.mask || !body.model))
    throw new Error("局部重绘需要蒙版和原生 inpainting 模型 ID。");
  for (const key of ["cfg_rescale", "strength", "noise"])
    if (has(p, key) && (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1))
      throw new Error(`${key} 须为 0–1。`);
  for (const key of ["v4_prompt", "v4_negative_prompt"]) {
    const characters = p[key]?.caption?.char_captions || [];
    const spec=modelSpec(body.model);
    if (characters.length > spec.webCapabilities.maxCharacters)
      throw new Error(`${spec.name} 最多支持 ${spec.webCapabilities.maxCharacters} 个角色提示词。`);
    for (const character of characters)
      for (const center of character.centers || []) {
        if (
          !Number.isFinite(center.x) ||
          !Number.isFinite(center.y) ||
          center.x < 0 ||
          center.x > 1 ||
          center.y < 0 ||
          center.y > 1
        )
          throw new Error("角色坐标 x、y 须为 0–1。");
      }
  }
  if (
    new TextEncoder().encode(JSON.stringify(payload)).byteLength >
    15 * 1024 * 1024
  )
    throw new Error("请求超过 15 MiB，请减少或压缩图像。");
  return payload;
}
export function safePreview(payload) {
  return JSON.stringify(
    payload,
    (key, value) =>
      typeof value === "string" && value.length > 1200
        ? `[${value.length} 字符，预览省略；发送完整数据]`
        : value,
    2,
  );
}
const ASSET_KEYS = new Set([
  "source",
  "mask",
  "image",
  "images",
  "reference_image",
  "reference_image_multiple",
  "director_reference_images",
  "controlnet_condition",
  "encoded",
  "encoding",
  "encodings",
  "dataURL",
  "b64_json",
]);
function withoutAssets(value) {
  if (
    typeof value === "string" &&
    (/^(?:data:image\/|blob:)/i.test(value) ||
      /^(?:iVBORw0KGgo|\/9j\/|UklGR|R0lGOD)[A-Za-z0-9+/=\s]*$/.test(value))
  )
    return undefined;
  if (Array.isArray(value))
    return value.map(withoutAssets).filter((v) => v !== undefined);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ASSET_KEYS.has(key))
        .map(([key, item]) => [key, withoutAssets(item)])
        .filter(([, item]) => item !== undefined),
    );
  return value;
}
export function exportPreset(state) {
  const extra = withoutAssets(parseObject(state.extraJSON || "{}", "扩展参数"));
  const clean = withoutAssets({
    ...state,
    extraJSON: "{}",
    vibes: [],
    precise: [],
    modelDrafts: undefined,
  });
  return {
    format: "novelai-studio",
    version: 1,
    state: {
      ...clean,
      model: modelSpec(state.model).id,
      source: "",
      mask: "",
      vibes: [],
      precise: [],
      extraJSON: JSON.stringify(extra, null, 2),
    },
  };
}
const MANAGED_PARAMETERS = [
  "width",
  "height",
  "steps",
  "scale",
  "n_samples",
  "seed",
  "sampler",
  "noise_schedule",
  "qualityToggle",
  "negative_prompt",
  "cfg_rescale",
  "image",
  "mask",
  "strength",
  "noise",
  "img2img",
  "v4_prompt",
  "v4_negative_prompt",
  "reference_image",
  "reference_strength",
  "reference_information_extracted",
  "reference_image_multiple",
  "reference_strength_multiple",
  "reference_information_extracted_multiple",
  "normalize_reference_strength_multiple",
  "director_reference_images",
  "director_reference_descriptions",
  "director_reference_information_extracted",
  "director_reference_strength_values",
  "director_reference_secondary_strength_values",
];
function imageURL(data) {
  if (!data) return "";
  if (data.startsWith("data:")) return data;
  const mime = data.startsWith("/9j/")
    ? "image/jpeg"
    : data.startsWith("UklGR")
      ? "image/webp"
      : "image/png";
  return `data:${mime};base64,${data}`;
}
export function stateFromPayload(payload) {
  const b = payload.novelai?.body;
  if (
    !b?.parameters ||
    (payload.novelai.endpoint &&
      !["/ai/generate-image", "/ai/generate-image-stream"].includes(
        payload.novelai.endpoint,
      ))
  )
    throw new Error("此请求不是可恢复的生图配方；可在 API 工作台中打开。");
  const p = b.parameters,
    sourceSpec = modelSpec(b.model || payload.model),
    s = defaults(sourceSpec.id);
  const chars = p.v4_prompt?.caption?.char_captions || [],
    negChars = p.v4_negative_prompt?.caption?.char_captions || [];
  let prompt = p.v4_prompt?.caption?.base_caption ?? b.input ?? "";
  const qualityMatch=p.qualityToggle?splitQualityPrompt(prompt,sourceSpec.id):{preset:null,prompt};
  prompt=qualityMatch.prompt;
  const overrides = omit(p, MANAGED_PARAMETERS);
  if (overrides.tag_hint_qt === (p.qualityToggle ? officialPresetHint(qualityMatch.preset||'standard') : 0))
    delete overrides.tag_hint_qt;
  if(sourceSpec.v5&&overrides.tag_hint_uc_preset===officialPresetHint(splitNegativePreset(p.v4_negative_prompt?.caption?.base_caption??p.negative_prompt,sourceSpec.id).preset))delete overrides.tag_hint_uc_preset;
  return recoverParameterState({
    ...s,
    model: sourceSpec.id,
    mode: b.action || "generate",
    prompt,
    negative:
      p.v4_negative_prompt?.caption?.base_caption ??
      p.negative_prompt ??
      s.negative,
    width: p.width ?? s.width,
    height: p.height ?? s.height,
    steps: p.steps ?? s.steps,
    scale: p.scale ?? s.scale,
    n: p.n_samples ?? s.n,
    seed: p.seed ?? s.seed,
    sampler: p.sampler ?? s.sampler,
    noise_schedule: p.noise_schedule ?? s.noise_schedule,
    quality: !!p.qualityToggle,
    qualityPreset: qualityMatch.preset || 'standard',
    cfg_rescale: p.cfg_rescale ?? s.cfg_rescale,
    coords: !!p.v4_prompt?.use_coords,
    originalCoords: !!p.v4_prompt?.use_coords,
    conditions: {
      positive: p.v4_prompt || {},
      negative: p.v4_negative_prompt || {},
    },
    characters: chars.map((c, i) => ({
      id: crypto.randomUUID(),
      enabled: true,
      prompt: c.char_caption,
      negative: negChars[i]?.char_caption || "",
      x: c.centers?.[0]?.x ?? 0.5,
      y: c.centers?.[0]?.y ?? 0.5,
      originalPosition: {
        x: c.centers?.[0]?.x ?? 0.5,
        y: c.centers?.[0]?.y ?? 0.5,
      },
      positiveCaption: c,
      negativeCaption: negChars[i] || {},
    })),
    source: imageURL(p.image),
    referenceMode:sourceSpec.v5?'off':p.director_reference_images?.length?'precise':p.reference_image_multiple?.length?'vibe':'off',
    precise:sourceSpec.v5?[]:(p.director_reference_images||[]).map((image,i)=>({id:crypto.randomUUID(),image:imageURL(image),type:p.director_reference_descriptions?.[i]?.caption?.base_caption||'character',strength:p.director_reference_strength_values?.[i]??1,fidelity:1-(p.director_reference_secondary_strength_values?.[i]??0)})),
    vibes:sourceSpec.v5?[]:(p.reference_image_multiple||[]).map((encoding,i)=>({id:crypto.randomUUID(),encoding,encodedModel:sourceSpec.id,encodedInformation:p.reference_information_extracted_multiple?.[i]??1,information:p.reference_information_extracted_multiple?.[i]??1,strength:p.reference_strength_multiple?.[i]??.6})),
    normalize:p.normalize_reference_strength_multiple??true,
    mask: imageURL(p.mask),
    strength: p.strength ?? p.img2img?.strength ?? s.strength,
    noise: p.noise ?? p.img2img?.noise ?? s.noise,
    infillParameters: omit(p.img2img, ["strength", "noise"]),
    nativeBodyExtras: omit(b, ["model", "input", "action", "parameters"]),
    overrides,
    extraJSON: "{}",
    stream: payload.novelai.endpoint?.endsWith("-stream") || false,
    output: payload.response_format || "b64_json",
  }).state;
}
