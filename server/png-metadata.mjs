import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
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
const SECRET_KEY =
  /^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|headers)$/i;

export function nativeRecipe(payload = {}, secret = "") {
  const native = payload.novelai?.body || payload;
  const parameters = native.parameters || payload.novelai?.parameters || {};
  const source = {
    ...native,
    model: native.model || payload.model || "nai-diffusion-5-full",
    input: native.input ?? payload.prompt ?? "",
    action: native.action || payload.novelai?.action || "generate",
    parameters,
  };
  delete source.novelai;
  delete source.prompt;
  delete source.response_format;
  function clean(value) {
    if (typeof value === "string") {
      if (
        /^(?:data:image\/|blob:)/i.test(value) ||
        /^(?:iVBORw0KGgo|\/9j\/|UklGR|R0lGOD)[A-Za-z0-9+/=\s]*$/.test(value)
      )
        return undefined;
      return (secret ? value.split(secret).join("[REDACTED]") : value).replace(
        /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
        "Bearer [REDACTED]",
      );
    }
    if (Array.isArray(value))
      return value.map(clean).filter((item) => item !== undefined);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !ASSET_KEYS.has(key) && !SECRET_KEY.test(key))
          .map(([key, item]) => [key, clean(item)])
          .filter(([, item]) => item !== undefined),
      );
    return value;
  }
  return clean(source);
}

function chunks(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  const result = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12)
      throw new Error("Invalid PNG chunk length");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    result.push({
      type,
      offset,
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
    if (type === "IEND") return result;
  }
  throw new Error("PNG has no complete IEND chunk");
}

// Only reads small textual metadata. Pixel chunks and upstream metadata stay byte-for-byte intact.
export function pngTextEntries(bytes) {
  const result = [];
  for (const { type, data } of chunks(bytes) || []) {
    if (
      !["tEXt", "iTXt", "zTXt"].includes(type) ||
      data.length > 2 * 1024 * 1024
    )
      continue;
    const separator = data.indexOf(0);
    if (separator < 1 || separator > 79) continue;
    const keyword = data.toString("latin1", 0, separator);
    let text;
    try {
      if (type === "tEXt") text = data.subarray(separator + 1).toString("utf8");
      else if (type === "zTXt") {
        if (data[separator + 1] !== 0) continue;
        text = inflateSync(data.subarray(separator + 2), {
          maxOutputLength: 2 * 1024 * 1024,
        }).toString("utf8");
      } else {
        const flag = data[separator + 1],
          method = data[separator + 2];
        const languageEnd = data.indexOf(0, separator + 3);
        const translatedEnd =
          languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
        if (translatedEnd < 0 || ![0, 1].includes(flag) || method !== 0)
          continue;
        const encoded = data.subarray(translatedEnd + 1);
        text = (
          flag
            ? inflateSync(encoded, { maxOutputLength: 2 * 1024 * 1024 })
            : encoded
        ).toString("utf8");
      }
      result.push({ keyword, text });
    } catch {
      /* A damaged optional text chunk does not destroy an otherwise usable image. */
    }
  }
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function recipeForImage(bytes, recipe, index = 0) {
  const result = structuredClone(recipe);
  let actualSeed;
  for (const { keyword, text } of pngTextEntries(bytes)) {
    if (!["Comment", "novelai_studio"].includes(keyword)) continue;
    try {
      const value = JSON.parse(text);
      const seed = value.parameters?.seed ?? value.seed;
      if (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295)
        actualSeed = seed;
    } catch {}
  }
  if (actualSeed !== undefined) result.parameters.seed = actualSeed;
  else if (index > 0) {
    // Without per-image upstream metadata a batch request seed is not proof of a sample's seed.
    delete result.parameters.seed;
  }
  return result;
}

export function withStudioMetadata(bytes, recipe) {
  const parsed = chunks(bytes);
  if (!parsed) return bytes;
  const encoded = Buffer.from(JSON.stringify(recipe), "utf8");
  if (encoded.length > 2 * 1024 * 1024)
    throw new Error("Recipe metadata exceeds 2 MiB");
  const previous = pngTextEntries(bytes)
    .filter((entry) => entry.keyword === "novelai_studio")
    .at(-1);
  if (previous?.text === encoded.toString("utf8")) return bytes;
  const payload = Buffer.concat([
    Buffer.from("novelai_studio\0\0\0\0\0", "ascii"),
    encoded,
  ]);
  const type = Buffer.from("iTXt", "ascii");
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  type.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([type, payload])),
    payload.length + 8,
  );
  const end = parsed.find((item) => item.type === "IEND").offset;
  return Buffer.concat([bytes.subarray(0, end), chunk, bytes.subarray(end)]);
}
