import { Gunzip, Unzlib } from "fflate";
import {
  partitionParameters,
  quarantineEntries,
  recoverParameterState,
} from "./parameter-policy.mjs";
import {
  MODEL_ID,
  schema,
  stateFromPayload,
  parseObject,
  buildRequest,
} from "./request.mjs";
import { modelSpec, switchModel } from "./model-policy.mjs";
import {splitQualityPrompt,splitNegativePreset,officialPresetHint} from './official-presets.mjs';

// Format references: https://github.com/NovelAI/novelai-image-metadata/blob/main/nai_meta.py
// and https://github.com/neggles/sd-webui-stealth-pnginfo/blob/main/scripts/stealth_pnginfo.py
// PNG text chunks follow https://www.w3.org/TR/png-3/#11textinfo .
const MAX_FILE = 64 * 1024 * 1024;
const MAX_TEXT = 4 * 1024 * 1024;
const MAX_PIXELS = 32 * 1024 * 1024;
const has = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key);
const object = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
const utf8 = new TextDecoder();
const bytesOf = (value) =>
  value instanceof Uint8Array ? value : new Uint8Array(value);
const ascii = (bytes) => utf8.decode(bytes);
function clean(value, depth = 0) {
  if (depth > 48) throw new Error("图片参数嵌套过深，无法导入。");
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (object(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["__proto__", "prototype", "constructor"].includes(k))
        .map(([k, v]) => [k, clean(v, depth + 1)]),
    );
  return value;
}
function json(value) {
  if (object(value)) return clean(value);
  if (typeof value !== "string" || value.length > MAX_TEXT) return null;
  try {
    const parsed = JSON.parse(value.replace(/^\uFEFF/, "").replace(/\0+$/, ""));
    return object(parsed) ? clean(parsed) : null;
  } catch {
    return null;
  }
}
function boundedText(bytes) {
  if (bytes.length > MAX_TEXT)
    throw new Error("图片元数据超过 4 MiB，已停止读取。");
  // UTF-8 is common even in tEXt; ISO-8859-1 is the standard fallback.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}
function inflate(bytes, gzip = false) {
  if (bytes.length > MAX_TEXT) throw new Error("压缩元数据过大。");
  const chunks = [];
  let length = 0;
  const decoder = new (gzip ? Gunzip : Unzlib)((part) => {
    length += part.length;
    if (length > MAX_TEXT)
      throw new Error("图片元数据解压后超过 4 MiB，已停止读取。");
    chunks.push(part);
  });
  // Small input pushes limit peak expansion before the output limit is checked.
  for (let at = 0; at < bytes.length; at += 512)
    decoder.push(bytes.subarray(at, at + 512), at + 512 >= bytes.length);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function zero(bytes, start) {
  const end = bytes.indexOf(0, start);
  if (end < 0) throw new Error("图片文字块不完整。");
  return end;
}
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
export function parsePngMetadata(input) {
  const bytes = bytesOf(input),
    raw = {},
    warnings = [],
    types = new Set();
  if (!PNG.every((v, i) => bytes[i] === v))
    throw new Error("文件不是有效的 PNG。");
  if (bytes.length > MAX_FILE) throw new Error("图片超过 64 MiB。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width,
    height,
    total = 0,
    chunkCount = 0;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    if (++chunkCount > 8192) {
      warnings.push("PNG 数据块过多，已停止继续读取。");
      break;
    }
    const size = view.getUint32(offset),
      type = ascii(bytes.subarray(offset + 4, offset + 8));
    if (size > bytes.length - offset - 12) {
      warnings.push("PNG 包含不完整的数据块。");
      break;
    }
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === "IHDR" && size >= 8) {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
    }
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      try {
        if (size > MAX_TEXT) throw new Error("单个文字块超过 4 MiB。");
        const split = zero(data, 0),
          key = ascii(data.subarray(0, split));
        if (!key || key.length > 79) throw new Error("文字块关键字无效。");
        let text;
        if (type === "tEXt") text = boundedText(data.subarray(split + 1));
        else if (type === "zTXt") {
          if (data[split + 1] !== 0) throw new Error("未知的 PNG 压缩方式。");
          text = boundedText(inflate(data.subarray(split + 2)));
        } else {
          const compressed = data[split + 1],
            method = data[split + 2];
          if (compressed > 1 || method !== 0)
            throw new Error("未知的 PNG 压缩方式。");
          const languageEnd = zero(data, split + 3),
            translatedEnd = zero(data, languageEnd + 1);
          const content = data.subarray(translatedEnd + 1);
          text = boundedText(compressed ? inflate(content) : content);
        }
        total += text.length;
        if (total > MAX_TEXT) throw new Error("图片全部文字块超过 4 MiB。");
        Object.defineProperty(raw, key, {
          value: text,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        types.add(type);
      } catch (error) {
        warnings.push(`${type}：${error.message}`);
        if (/4 MiB|压缩元数据过大/.test(error.message)) break;
      }
    }
    offset += size + 12;
    if (type === "IEND") break;
  }
  return {
    raw,
    width,
    height,
    format: "PNG",
    source: types.size ? `PNG ${[...types].join(" / ")}` : "PNG",
    warnings,
  };
}

export function readStealthMetadata(input, width, height) {
  const rgba = bytesOf(input);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_PIXELS ||
    rgba.length !== width * height * 4
  )
    throw new Error("隐写元数据的像素尺寸无效或过大。");
  for (const mode of ["alpha", "rgb"]) {
    const channels = mode === "alpha" ? 1 : 3,
      capacity = width * height * channels;
    if (capacity < 152) continue;
    let pos = 0;
    function nextByte() {
      let value = 0;
      for (let bit = 0; bit < 8; bit++, pos++) {
        const pixel = Math.floor(pos / channels),
          x = Math.floor(pixel / height),
          y = pixel % height;
        const channel = mode === "alpha" ? 3 : pos % 3;
        value = value * 2 + (rgba[(y * width + x) * 4 + channel] & 1);
      }
      return value;
    }
    const header = new Uint8Array(15);
    for (let i = 0; i < header.length; i++) header[i] = nextByte();
    const signature = ascii(header),
      prefix = `stealth_${mode === "alpha" ? "png" : "rgb"}`;
    if (![`${prefix}info`, `${prefix}comp`].includes(signature)) continue;
    let bits = 0;
    for (let i = 0; i < 4; i++) bits = bits * 256 + nextByte();
    if (bits % 8 || bits > capacity - pos || bits / 8 > MAX_TEXT)
      throw new Error("图片隐写元数据长度无效、已损坏或过大。");
    const content = new Uint8Array(bits / 8);
    for (let i = 0; i < content.length; i++) content[i] = nextByte();
    const text = boundedText(
      signature.endsWith("comp") ? inflate(content, true) : content,
    );
    const raw = json(text);
    if (!raw)
      throw new Error("图片包含隐写信息，但不是可导入的 NovelAI JSON 参数。");
    return { raw, source: signature };
  }
  return null;
}

// EXIF ImageDescription/Software/UserComment are used in WebP and JPEG exports.
function exifMetadata(input) {
  let bytes = input;
  if (ascii(bytes.subarray(0, 6)) === "Exif\0\0") bytes = bytes.subarray(6);
  const raw = {},
    endian = ascii(bytes.subarray(0, 2));
  if (bytes.length < 8 || !["II", "MM"].includes(endian)) return raw;
  const little = endian === "II",
    v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at) => v.getUint16(at, little),
    u32 = (at) => v.getUint32(at, little),
    seen = new Set();
  if (u16(2) !== 42) return raw;
  function ifd(at, depth = 0) {
    if (depth > 4 || seen.has(at) || at < 8 || at + 2 > bytes.length) return;
    seen.add(at);
    const count = u16(at);
    if (count > 1024 || at + 2 + count * 12 > bytes.length) return;
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12,
        tag = u16(entry),
        type = u16(entry + 2),
        count = u32(entry + 4);
      if (tag === 34665 && type === 4) {
        ifd(u32(entry + 8), depth + 1);
        continue;
      }
      const key = { 270: "Description", 305: "Software", 37510: "UserComment" }[
        tag
      ];
      if (!key || ![1, 2, 7].includes(type) || count > MAX_TEXT) continue;
      const start = count <= 4 ? entry + 8 : u32(entry + 8);
      if (start + count > bytes.length) continue;
      let value = bytes.subarray(start, start + count);
      if (key === "UserComment") {
        const encoding = ascii(value.subarray(0, 8));
        if (encoding.startsWith("UNICODE")) {
          raw[key] = new TextDecoder(little ? "utf-16le" : "utf-16be")
            .decode(value.subarray(8))
            .replace(/\0+$/, "");
          continue;
        }
        if (
          encoding.startsWith("ASCII") ||
          value.subarray(0, 8).every((b) => b === 0)
        )
          value = value.subarray(8);
      }
      raw[key] = boundedText(value).replace(/\0+$/, "");
    }
  }
  ifd(u32(4));
  return raw;
}
export function parseExifImageMetadata(input) {
  const bytes = bytesOf(input),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let raw = {},
    format = "Image",
    warnings = [];
  try {
    if (
      ascii(bytes.subarray(0, 4)) === "RIFF" &&
      ascii(bytes.subarray(8, 12)) === "WEBP"
    ) {
      format = "WebP";
      for (let at = 12; at + 8 <= bytes.length;) {
        const name = ascii(bytes.subarray(at, at + 4)),
          size = view.getUint32(at + 4, true);
        if (size > bytes.length - at - 8) break;
        if (name === "EXIF")
          raw = {
            ...raw,
            ...exifMetadata(bytes.subarray(at + 8, at + 8 + size)),
          };
        at += 8 + size + (size % 2);
      }
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      format = "JPEG";
      for (let at = 2; at + 4 <= bytes.length;) {
        if (bytes[at] !== 255) break;
        const marker = bytes[at + 1];
        if (marker === 218 || marker === 217) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) {
          at += 2;
          continue;
        }
        const size = view.getUint16(at + 2);
        if (size < 2 || size > bytes.length - at - 2) break;
        if (marker === 225)
          raw = {
            ...raw,
            ...exifMetadata(bytes.subarray(at + 4, at + 2 + size)),
          };
        at += size + 2;
      }
    }
  } catch (error) {
    warnings.push(`EXIF：${error.message}`);
  }
  return { raw, format, source: `${format} EXIF`, warnings };
}

const INFO_KEYS = new Set([
  "prompt",
  "uc",
  "negative",
  "input",
  "parameters",
  "novelai",
  "model",
  "action",
  "version",
  "request_type",
  "model_name",
  "model_hash",
  "signed_hash",
  "Software",
  "Source",
  "Title",
  "Description",
  "Comment",
  "Generation time",
  "stream",
]);
const ASSETS =
  /^(?:image|images|mask|reference_.*|normalize_reference_.*|director_reference_.*|characterRef|controlnet_condition|vibes|precise)$/;
function sourceModelSpec(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return modelSpec(value); } catch { /* Human-readable PNG metadata follows. */ }
  const label = value.toLowerCase();
  if (/v4[.]5/.test(label) && /(?:full|curated)/.test(label)) return modelSpec(`nai-diffusion-4-5-${/curated/.test(label) ? 'curated' : 'full'}`);
  if (/\bv5\b/.test(label) && /full/.test(label)) return modelSpec(MODEL_ID);
  return null;
}
const PROMPT_KEYS = new Set(["qualityToggle", "tag_hint_qt"]);
const NEGATIVE_KEYS = new Set([
  "negative_prompt",
  "ucPreset",
  "tag_hint_uc_preset",
]);
function parameterGroup(key) {
  if (key === "seed") return "seed";
  if (PROMPT_KEYS.has(key)) return "prompt";
  if (NEGATIVE_KEYS.has(key)) return "negative";
  if (["v4_prompt", "v4_negative_prompt"].includes(key)) return "characters";
  return "settings";
}
export function normalizeImageMetadata(rawInput, info = {}) {
  const raw = clean(rawInput || {}),
    warnings = [...(info.warnings || [])];
  const studio = json(raw.novelai_studio);
  const comment =
    studio ||
    json(raw.Comment) ||
    json(raw.UserComment) ||
    json(raw.parameters) ||
    raw;
  const native =
    comment.novelai?.body || (object(comment.parameters) ? comment : null);
  const src = native?.parameters || comment;
  const sourceModel = native?.model || src.model_name || src.model || "";
  const sourceSpec = sourceModelSpec(sourceModel);
  if (
    typeof sourceModel === "string" &&
    sourceModel &&
    (/nai-diffusion-/i.test(sourceModel) ||
      /NovelAI Diffusion/i.test(sourceModel)) &&
    !sourceSpec && !/^NovelAI Diffusion V5$/i.test(sourceModel)
  )
    warnings.push(
      `原图模型为 ${sourceModel}，当前不支持恢复该模型；可导入文本和其他已识别参数。`,
    );
  const recognizable =
    object(src) &&
    (has(src, "prompt") ||
      has(src, "uc") ||
      has(src, "negative_prompt") ||
      has(src, "v4_prompt") ||
      has(src, "seed") ||
      has(src, "steps") ||
      has(native, "input"));
  const isNovelAI = recognizable || /novelai/i.test(String(raw.Software || ""));
  const candidates = {};
  if (recognizable)
    for (const [key, value] of Object.entries(src)) {
      if (!INFO_KEYS.has(key) && !ASSETS.test(key) && value !== null)
        candidates[key] = clean(value);
    }
  const { accepted: parameters, excluded: excludedParameters } =
    partitionParameters(candidates);
  if (Object.keys(excludedParameters).length)
    warnings.push(
      `以下未识别的图片内部字段仅保留供查看，不发送：${Object.keys(excludedParameters).join("、")}。`,
    );
  const prompt =
    parameters.v4_prompt?.caption?.base_caption ??
    native?.input ??
    src.prompt ??
    (isNovelAI ? raw.Description : undefined);
  const negative =
    parameters.v4_negative_prompt?.caption?.base_caption ??
    src.negative_prompt ??
    src.uc;
  if (typeof negative === "string") parameters.negative_prompt = negative;
  if (typeof prompt === "string") {
    // Official metadata stores the expanded prompt; tag_hint_qt records quality-tag state.
    const matched = splitQualityPrompt(prompt,(sourceSpec || modelSpec(MODEL_ID)).id);
    if (!has(parameters, "qualityToggle"))
      parameters.qualityToggle =
        !!matched.preset && src.tag_hint_qt !== 0;
    // Unknown expansions are kept literally with automatic suffixing disabled.
    if (parameters.qualityToggle && !matched.preset)
      parameters.qualityToggle = false;
  }
  const positiveChars = parameters.v4_prompt?.caption?.char_captions;
  const negativeChars = parameters.v4_negative_prompt?.caption?.char_captions;
  const available = {
    prompt: typeof prompt === "string",
    negative: typeof negative === "string",
    characters: Array.isArray(positiveChars) || Array.isArray(negativeChars),
    settings: !!sourceSpec || Object.keys(parameters).some(
      (key) => parameterGroup(key) === "settings",
    ),
    seed: has(parameters, "seed"),
  };
  if (
    !available.prompt &&
    !available.negative &&
    !available.characters &&
    !available.settings &&
    !available.seed
  )
    warnings.push(
      "没有发现可导入的 NovelAI 参数；图片可能未保存元数据，或曾被转码、截图、压缩。",
    );
  if (studio)
    info = { ...info, source: `${info.format || "PNG"} · novelai_studio` };
  const payload = Object.values(available).some(Boolean)
    ? {
         model: sourceSpec?.id || MODEL_ID,
        novelai: {
          endpoint: "/ai/generate-image",
          body: {
             model: sourceSpec?.id || MODEL_ID,
            input: prompt ?? "",
            action: "generate",
            parameters,
          },
        },
      }
    : null;
  return {
    ...info,
    raw,
    parameters,
    excludedParameters,
    payload,
    available,
    warnings,
    sourceModel,
    prompt: prompt ?? "",
    negative: negative ?? "",
    characters: positiveChars || [],
    seed: parameters.seed,
  };
}

export async function readImageMetadata(file) {
  if (!file || typeof file.arrayBuffer !== "function")
    throw new Error("请选择一个本地图片文件。");
  if (file.size > MAX_FILE)
    throw new Error("图片超过 64 MiB，请选择较小的原图。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_FILE) throw new Error("图片超过 64 MiB。");
  const isPNG = PNG.every((v, i) => bytes[i] === v);
  let info = isPNG ? parsePngMetadata(bytes) : parseExifImageMetadata(bytes);
  if (info.width * info.height > MAX_PIXELS) {
    info.warnings.push(
      "图片超过 3200 万像素，已跳过隐写读取；普通元数据仍可导入。",
    );
  } else if (
    !json(info.raw.novelai_studio) &&
    typeof createImageBitmap === "function" &&
    typeof document !== "undefined"
  ) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      info.width ??= bitmap.width;
      info.height ??= bitmap.height;
      if (bitmap.width * bitmap.height > MAX_PIXELS)
        throw new Error("图片超过 3200 万像素，已跳过隐写读取。");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法读取图片像素。");
      context.drawImage(bitmap, 0, 0);
      const stealth = readStealthMetadata(
        context.getImageData(0, 0, bitmap.width, bitmap.height).data,
        bitmap.width,
        bitmap.height,
      );
      if (stealth)
        info = {
          ...info,
          raw: { ...info.raw, ...stealth.raw },
          source: stealth.source,
        };
      canvas.width = canvas.height = 0;
    } catch (error) {
      info.warnings.push(error.message);
    } finally {
      bitmap?.close();
    }
  }
  return normalizeImageMetadata(info.raw, {
    ...info,
    filename: file.name || "图片",
  });
}

const CONTROL_MAP = {
  width: "width",
  height: "height",
  steps: "steps",
  scale: "scale",
  n_samples: "n",
  sampler: "sampler",
  noise_schedule: "noise_schedule",
  cfg_rescale: "cfg_rescale",
  strength: "strength",
  noise: "noise",
};
function appendText(current, incoming, append) {
  return append && current && incoming ? `${current}\n${incoming}` : incoming;
}
function cloneCondition(condition) {
  return { ...condition, caption: { ...condition?.caption } };
}
export function applyMetadata(current, metadata, options = {}) {
  if (!metadata?.payload) return current;
  const selected = Object.fromEntries(
    Object.entries(metadata.available).map(([key, value]) => [
      key,
      value && options[key] !== false,
    ]),
  );
  if (!Object.values(selected).some(Boolean)) return current;
  const p = metadata.parameters,
    incoming = stateFromPayload(metadata.payload),
     next = selected.settings && metadata.payload.model !== current.model
       ? switchModel(current, metadata.payload.model)
       : { ...current };
   const overrides = { ...next.overrides },
     extra = { ...parseObject(next.extraJSON || "{}", "当前扩展参数") };
  const append = !!options.append;
  let effective = current;
  // Materialize any complete compound overrides before editing one part. This preserves
  // their other fields, while subsequent prompt/character edits stay authoritative.
  if (
    (selected.prompt || selected.negative || selected.characters) &&
    ["v4_prompt", "v4_negative_prompt"].some(
      (key) => has(extra, key) || has(overrides, key),
    )
  ) {
    const materialized = stateFromPayload(buildRequest(current));
    effective = { ...current };
    for (const key of [
      "prompt",
      "negative",
      "characters",
      "coords",
      "originalCoords",
      "conditions",
    ])
      next[key] = effective[key] = materialized[key];
    for (const key of ["v4_prompt", "v4_negative_prompt"]) {
      delete overrides[key];
      delete extra[key];
    }
  }
  let positive = cloneCondition(effective.conditions?.positive),
    negative = cloneCondition(effective.conditions?.negative);
  const effectiveCharacters = effective.characters;
  if (selected.prompt) {
    next.prompt = appendText(effective.prompt, incoming.prompt, append);
    next.quality = incoming.quality;
    next.qualityPreset = incoming.qualityPreset;
    for (const key of PROMPT_KEYS) {
      delete overrides[key];
      delete extra[key];
    }
    if (has(p, "tag_hint_qt")&&p.tag_hint_qt!==(incoming.quality?officialPresetHint(incoming.qualityPreset):0)) overrides.tag_hint_qt = p.tag_hint_qt;
  }
  if (selected.negative) {
    next.negative = appendText(effective.negative, incoming.negative, append);
    for (const key of NEGATIVE_KEYS) {
      delete overrides[key];
      delete extra[key];
    }
    for (const key of ["ucPreset", "tag_hint_uc_preset"])
      if (has(p, key)&&(key==='ucPreset'||p[key]!==officialPresetHint(splitNegativePreset(incoming.negative,incoming.model).preset))) overrides[key] = p[key];
  }
  if (selected.characters) {
    // Pair positive and negative caption arrays even if only negative characters exist.
    const sourceChars = incoming.characters;
    const negChars = p.v4_negative_prompt?.caption?.char_captions || [];
    for (let i = sourceChars.length; i < negChars.length; i++) {
      const caption = negChars[i],
        center = caption.centers?.[0] || { x: 0.5, y: 0.5 };
      sourceChars.push({
        id: crypto.randomUUID(),
        enabled: true,
        prompt: "",
        negative: caption.char_caption || "",
        x: center.x,
        y: center.y,
        originalPosition: center,
        positiveCaption: {
          char_caption: "",
          centers: caption.centers || [center],
        },
        negativeCaption: caption,
      });
    }
    next.characters = append
      ? [...effectiveCharacters, ...sourceChars]
      : sourceChars;
    const limit = modelSpec(next.model).webCapabilities.maxCharacters;
    if (next.characters.length > limit)
      throw new Error(`导入后角色数量超过 ${modelSpec(next.model).name} 的 ${limit} 个上限。`);
    if (has(p.v4_prompt, "use_coords")) {
      next.coords = !!p.v4_prompt.use_coords;
      next.originalCoords = next.coords;
    }
    positive = {
      ...positive,
      ...p.v4_prompt,
      caption: { ...positive.caption, ...p.v4_prompt?.caption },
    };
    negative = {
      ...negative,
      ...p.v4_negative_prompt,
      caption: { ...negative.caption, ...p.v4_negative_prompt?.caption },
    };
  }
  if (selected.settings) {
    next.quarantinedParameters = {
      ...current.quarantinedParameters,
      ...quarantineEntries(metadata.excludedParameters || {}, "图片元数据"),
    };
    for (const [key, value] of Object.entries(p)) {
      if (parameterGroup(key) !== "settings") continue;
      delete overrides[key];
      delete extra[key];
      if (CONTROL_MAP[key]) next[CONTROL_MAP[key]] = value;
      else if (key === "img2img" && object(value)) {
        next.infillParameters = Object.fromEntries(
          Object.entries(value).filter(
            ([k]) => !["strength", "noise"].includes(k),
          ),
        );
        if (has(value, "strength") && !has(p, "strength"))
          next.strength = value.strength;
        if (has(value, "noise") && !has(p, "noise")) next.noise = value.noise;
      } else overrides[key] = clean(value);
    }
  }
  if (selected.seed) {
    next.seed = p.seed;
    delete overrides.seed;
    delete extra.seed;
  }
  next.conditions = { ...current.conditions, positive, negative };
  next.overrides = overrides;
  next.extraJSON = JSON.stringify(extra, null, 2);
  return recoverParameterState(next).state;
}
