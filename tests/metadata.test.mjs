import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, zlibSync } from "fflate";
import {
  defaults,
  buildRequest,
  MODEL_ID,
  schema,
} from "../src/lib/request.mjs";
import {
  parsePngMetadata,
  readStealthMetadata,
  parseExifImageMetadata,
  normalizeImageMetadata,
  readImageMetadata,
  applyMetadata,
} from "../src/lib/metadata.mjs";

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const join = (...parts) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
};
const be32 = (n) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
};
const le32 = (n) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
};
const chunk = (name, content) =>
  join(be32(content.length), bytes(name), content, new Uint8Array(4));
const png = (...chunks) =>
  join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", join(be32(832), be32(1216), new Uint8Array([8, 6, 0, 0, 0]))),
    ...chunks,
    chunk("IEND", new Uint8Array()),
  );
const textChunk = (key, value) =>
  chunk("tEXt", join(bytes(key), new Uint8Array(1), bytes(value)));
const itxtChunk = (key, value, compressed = false) =>
  chunk(
    "iTXt",
    join(
      bytes(key),
      new Uint8Array([0, compressed ? 1 : 0, 0, 0, 0]),
      compressed ? zlibSync(bytes(value)) : bytes(value),
    ),
  );
const normalize = (value) =>
  normalizeImageMetadata({
    Software: "NovelAI",
    Comment: JSON.stringify(value),
  });
const off = {
  prompt: false,
  negative: false,
  characters: false,
  settings: false,
  seed: false,
};
const out = (state) => buildRequest(state).novelai.body.parameters;
const suffix = schema.models.find((m) => m.id === MODEL_ID).qualitySuffix;

test("PNG reads tEXt, zTXt, iTXt and compressed UTF-8 iTXt", () => {
  const data = png(
    textChunk("Software", "NovelAI"),
    chunk(
      "zTXt",
      join(
        bytes("Description"),
        new Uint8Array([0, 0]),
        zlibSync(bytes("quiet room")),
      ),
    ),
    itxtChunk(
      "Comment",
      JSON.stringify({
        prompt: "静かな部屋",
        uc: "bad",
        seed: 0,
        cfg_rescale: 0,
        prefer_brownian: false,
      }),
      true,
    ),
    itxtChunk("Author", "测试用户"),
  );
  const parsed = parsePngMetadata(data),
    meta = normalizeImageMetadata(parsed.raw, parsed);
  assert.equal(parsed.width, 832);
  assert.equal(parsed.height, 1216);
  assert.equal(parsed.raw.Author, "测试用户");
  assert.equal(meta.prompt, "静かな部屋");
  assert.equal(meta.parameters.seed, 0);
  assert.equal(meta.parameters.prefer_brownian, false);
  assert.equal(meta.parameters.cfg_rescale, 0);
  assert.equal(meta.negative, "bad");
  assert.equal(meta.available.seed, true);
  assert.deepEqual(meta.warnings, []);
});

test("novelai_studio native request has priority over older untouched image metadata", async () => {
  const own = {
    model: MODEL_ID,
    input: "actual request",
    action: "generate",
    parameters: {
      negative_prompt: "actual negative",
      seed: 0,
      width: 1024,
      future_nested: { a: [0, false, { x: 1 }] },
    },
  };
  const data = png(
    textChunk(
      "Comment",
      JSON.stringify({ prompt: "stale", uc: "stale negative", seed: 999 }),
    ),
    itxtChunk("novelai_studio", JSON.stringify(own)),
  );
  const meta = await readImageMetadata(
    new File([data], "record.png", { type: "image/png" }),
  );
  assert.equal(meta.prompt, own.input);
  assert.equal(meta.negative, own.parameters.negative_prompt);
  assert.equal(meta.seed, 0);
  assert.match(meta.source, /novelai_studio/);
  assert.equal(meta.parameters.future_nested, undefined);
  assert.deepEqual(
    meta.excludedParameters.future_nested,
    own.parameters.future_nested,
  );
});

function stealth(raw, mode, compressed) {
  const signature = `stealth_${mode === "alpha" ? "png" : "rgb"}${compressed ? "comp" : "info"}`;
  const content = compressed
    ? gzipSync(bytes(JSON.stringify(raw)))
    : bytes(JSON.stringify(raw));
  const stream = join(bytes(signature), be32(content.length * 8), content),
    width = 83,
    height = Math.max(71, Math.ceil((stream.length * 8) / width));
  const rgba = new Uint8Array(width * height * 4).fill(254),
    channels = mode === "alpha" ? 1 : 3;
  for (let at = 0; at < rgba.length; at += 4) rgba[at + 3] = 255;
  for (let bit = 0; bit < stream.length * 8; bit++) {
    const pixel = Math.floor(bit / channels),
      x = Math.floor(pixel / height),
      y = pixel % height;
    const at = (y * width + x) * 4 + (mode === "alpha" ? 3 : bit % 3);
    rgba[at] =
      (rgba[at] & 254) | ((stream[Math.floor(bit / 8)] >> (7 - (bit % 8))) & 1);
  }
  return { rgba, width, height, signature };
}
for (const mode of ["alpha", "rgb"])
  for (const compressed of [false, true]) {
    test(`stealth ${mode} ${compressed ? "gzip" : "plain"} uses column-major pixels and exact bit length`, () => {
      const raw = {
        Software: "NovelAI",
        Description: "房间",
        Comment: JSON.stringify({ prompt: "房间", seed: 0, nested: [1, 2, 3] }),
      };
      const data = stealth(raw, mode, compressed);
      const read = readStealthMetadata(data.rgba, data.width, data.height);
      assert.equal(read.source, data.signature);
      assert.deepEqual(read.raw, raw);
    });
  }

test("corrupt stealth lengths and oversized decompressed metadata fail boundedly", () => {
  const data = stealth({ prompt: "a" }, "alpha", false);
  for (let bit = 15 * 8; bit < 19 * 8; bit++) {
    const x = Math.floor(bit / data.height),
      y = bit % data.height;
    data.rgba[(y * data.width + x) * 4 + 3] |= 1;
  }
  assert.throws(
    () => readStealthMetadata(data.rgba, data.width, data.height),
    /长度/,
  );
  const packed = png(
    itxtChunk(
      "Comment",
      JSON.stringify({ prompt: "a".repeat(4 * 1024 * 1024 + 1) }),
      true,
    ),
  );
  const parsed = parsePngMetadata(packed);
  assert.equal(parsed.raw.Comment, undefined);
  assert.match(parsed.warnings.join(), /4 MiB/);
});

test("normalization separates metadata and assets from generation parameters", () => {
  const meta = normalize({
    prompt: "room",
    uc: "noise",
    model_name: "NovelAI Diffusion V4",
    signed_hash: "signature",
    request_type: "PromptGenerateRequest",
    version: 1,
    image: "private",
    director_reference_strengths: [1],
    reference_image_multiple: ["private"],
    skip_cfg_above_sigma: null,
    unknown_nested: { x: [null, 0, false] },
    stream: "msgpack",
  });
  assert.equal(meta.payload.model, MODEL_ID);
  assert.equal(meta.payload.novelai.body.model, MODEL_ID);
  assert.equal(meta.sourceModel, "NovelAI Diffusion V4");
  assert.match(meta.warnings.join(), /当前不支持恢复该模型/);
  for (const key of [
    "signed_hash",
    "model_name",
    "request_type",
    "version",
    "image",
    "director_reference_strengths",
    "reference_image_multiple",
    "skip_cfg_above_sigma",
    "stream",
  ])
    assert.equal(meta.parameters[key], undefined);
  assert.equal(meta.parameters.unknown_nested, undefined);
  assert.deepEqual(meta.excludedParameters.unknown_nested, {
    x: [null, 0, false],
  });
});

test("V4.5 metadata restores its model only with settings and never activates partial references", () => {
  const meta = normalize({
    model_name: "NovelAI Diffusion V4.5 Curated",
    prompt: "a quiet room",
    width: 1024,
    director_reference_images: ["private-image"],
    director_reference_descriptions: [{ caption: { base_caption: "character" } }],
    reference_image_multiple_cached: [{ data: "private-vibe" }],
  });
  assert.equal(meta.payload.model, "nai-diffusion-4-5-curated");
  assert.equal(meta.warnings.some(w => /仍使用 V5/.test(w)), false);
  assert.equal(meta.parameters.director_reference_images, undefined);
  assert.equal(meta.parameters.reference_image_multiple_cached, undefined);
  const promptOnly = applyMetadata(defaults(), meta, { ...off, prompt: true });
  assert.equal(promptOnly.model, MODEL_ID);
  const settingsOnly = applyMetadata(defaults(), meta, { ...off, settings: true });
  assert.equal(settingsOnly.model, "nai-diffusion-4-5-curated");
  assert.equal(settingsOnly.width, 1024);
  assert.deepEqual(settingsOnly.precise, []);
  assert.deepEqual(settingsOnly.vibes, []);
});

test("prompt-only import preserves other groups and does not duplicate quality suffix", () => {
  const current = {
    ...defaults(),
    prompt: "old",
    negative: "keep negative",
    width: 768,
    seed: 54,
    overrides: { seed: 64, width: 1536, keep: false },
    extraJSON: '{"height":2048,"nested":{"x":2}}',
  };
  const meta = normalize({
    prompt: "room" + suffix,
    uc: "new negative",
    tag_hint_qt: 1,
    width: 1024,
    seed: 0,
    custom: "new",
  });
  const next = applyMetadata(current, meta, { ...off, prompt: true });
  assert.equal(next.prompt, "room");
  assert.equal(next.negative, current.negative);
  assert.equal(next.width, current.width);
  assert.equal(next.seed, current.seed);
  assert.deepEqual(next.overrides, { seed: 64, width: 1536 });
  assert.equal(next.quarantinedParameters.keep.value, false);
  assert.deepEqual(JSON.parse(next.extraJSON), JSON.parse(current.extraJSON));
  const request = buildRequest(next);
  assert.equal(request.novelai.body.input, "room" + suffix);
  assert.equal(request.novelai.body.parameters.tag_hint_qt, 1);
  assert.equal(out(next).negative_prompt, "keep negative");
  assert.equal(out(next).seed, 64);
  assert.equal(next.overrides.custom, undefined);
});

test("literal expanded prompts without a known suffix are not silently expanded again", () => {
  const meta = normalize({
    prompt: "room, custom quality tags",
    tag_hint_qt: 1,
  });
  const next = applyMetadata(defaults(), meta, { ...off, prompt: true });
  assert.equal(next.quality, false);
  assert.equal(buildRequest(next).novelai.body.input, meta.prompt);
});

test("settings-only import preserves missing values and quarantines unknown old and imported fields", () => {
  const current = {
    ...defaults(),
    prompt: "current",
    width: 768,
    height: 1280,
    steps: 33,
    scale: 9,
    seed: 67,
    mode: "img2img",
    source: "data:image/png;base64,b2xk",
    mask: "oldmask",
    overrides: { seed: 77, keep: { a: true }, width: 1536, cfg_rescale: 0.8 },
    extraJSON: '{"cfg_rescale":0.7,"keep_extra":1}',
  };
  const meta = normalize({
    prompt: "incoming",
    uc: "incoming negative",
    width: 1024,
    cfg_rescale: 0,
    noise: 0,
    prefer_brownian: false,
    unknown_new: { a: [1, null, false] },
    seed: 0,
  });
  const next = applyMetadata(current, meta, { ...off, settings: true });
  assert.equal(next.prompt, current.prompt);
  assert.equal(next.negative, current.negative);
  assert.equal(next.seed, current.seed);
  assert.equal(next.overrides.seed, 77);
  assert.equal(next.height, 1280);
  assert.equal(next.steps, 33);
  assert.equal(next.scale, 9);
  assert.equal(next.width, 1024);
  assert.equal(next.cfg_rescale, 0);
  assert.equal(next.noise, 0);
  assert.equal(next.source, current.source);
  assert.equal(next.mask, current.mask);
  assert.equal(next.mode, current.mode);
  assert.equal(next.overrides.keep, undefined);
  assert.deepEqual(next.quarantinedParameters.keep.value, { a: true });
  assert.equal(next.overrides.prefer_brownian, false);
  assert.equal(next.overrides.unknown_new, undefined);
  assert.deepEqual(next.quarantinedParameters.unknown_new.value, {
    a: [1, null, false],
  });
  assert.equal(out(next).cfg_rescale, 0);
  assert.equal(out(next).width, 1024);
  assert.deepEqual(JSON.parse(next.extraJSON), { keep_extra: 1 });
});

test("seed zero and explicit empty negative import; append joins text and characters", () => {
  const current = {
    ...defaults(),
    prompt: "old",
    negative: "exclude",
    seed: 99,
    overrides: { seed: 78 },
    extraJSON: '{"seed":67}',
  };
  const meta = normalize({ prompt: "new", uc: "", seed: 0 });
  const next = applyMetadata(current, meta, {
    ...off,
    prompt: true,
    negative: true,
    seed: true,
    append: true,
  });
  assert.equal(next.prompt, "old\nnew");
  assert.equal(next.negative, "");
  assert.equal(next.seed, 0);
  assert.equal(out(next).seed, 0);
  assert.equal(out(next).negative_prompt, "");
});

test("compound character captions and multiple centers survive import and editing", () => {
  const centers = [
    { x: 0.1, y: 0.2, label: "first" },
    { x: 0.8, y: 0.9 },
  ];
  const meta = normalize({
    prompt: "scene",
    v4_prompt: {
      use_coords: true,
      use_order: false,
      future: 1,
      caption: {
        base_caption: "scene",
        extra_caption: "keep",
        char_captions: [{ char_caption: "person", centers, tag: "keep" }],
      },
    },
    v4_negative_prompt: {
      use_coords: false,
      use_order: false,
      caption: {
        base_caption: "blur",
        char_captions: [
          { char_caption: "hands", centers: [{ x: 0.3, y: 0.4 }], extra: 2 },
        ],
      },
    },
  });
  const next = applyMetadata(
    { ...defaults(), prompt: "keep base", negative: "keep negative" },
    meta,
    { ...off, characters: true },
  );
  assert.equal(next.prompt, "keep base");
  assert.equal(next.negative, "keep negative");
  assert.equal(next.characters[0].prompt, "person");
  assert.equal(next.coords, true);
  let p = out(next);
  assert.deepEqual(p.v4_prompt.caption.char_captions[0].centers, centers);
  assert.equal(p.v4_prompt.use_order, false);
  assert.equal(p.v4_prompt.future, 1);
  assert.equal(p.v4_negative_prompt.use_coords, false);
  assert.equal(p.v4_negative_prompt.caption.char_captions[0].extra, 2);
  next.characters[0].prompt = "edited";
  p = out(next);
  assert.equal(p.v4_prompt.caption.char_captions[0].char_caption, "edited");
});

test("prompt import keeps already edited character controls over stale condition snapshots", () => {
  const meta = normalize({
    prompt: "first",
    v4_prompt: {
      use_coords: true,
      caption: {
        base_caption: "first",
        char_captions: [
          { char_caption: "original", centers: [{ x: 0.2, y: 0.3 }] },
        ],
      },
    },
  });
  const current = applyMetadata(defaults(), meta);
  current.characters[0].prompt = "edited";
  const next = applyMetadata(current, normalize({ prompt: "second" }), {
    ...off,
    prompt: true,
  });
  assert.equal(next.characters[0].prompt, "edited");
  assert.equal(
    out(next).v4_prompt.caption.char_captions[0].char_caption,
    "edited",
  );
});

test("selective prompt import materializes compound overrides without losing unselected character or coordinate fields", () => {
  const positive = {
    use_coords: true,
    use_order: false,
    future_flag: false,
    caption: {
      base_caption: "old" + suffix,
      char_captions: [
        {
          char_caption: "kept character",
          centers: [
            { x: 0.15, y: 0.8 },
            { x: 0.4, y: 0.6 },
          ],
        },
      ],
    },
  };
  const negative = {
    use_coords: false,
    use_order: true,
    caption: {
      base_caption: "kept negative",
      char_captions: [
        {
          char_caption: "kept character negative",
          centers: [{ x: 0.2, y: 0.7 }],
        },
      ],
    },
  };
  const current = {
    ...defaults(),
    prompt: "shadowed",
    negative: "shadowed negative",
    overrides: { v4_prompt: positive, untouched: 0 },
    extraJSON: JSON.stringify({
      v4_negative_prompt: negative,
      untouched_extra: false,
    }),
  };
  const next = applyMetadata(
    current,
    normalize({ prompt: "new" + suffix, tag_hint_qt: 1 }),
    { ...off, prompt: true },
  );
  const p = out(next);
  assert.equal(p.v4_prompt.caption.base_caption, "new" + suffix);
  assert.deepEqual(
    p.v4_prompt.caption.char_captions,
    positive.caption.char_captions,
  );
  assert.equal(p.v4_prompt.use_coords, true);
  assert.equal(p.v4_prompt.use_order, false);
  assert.deepEqual(p.v4_negative_prompt, negative);
  assert.equal(next.overrides.untouched, undefined);
  assert.equal(next.quarantinedParameters.untouched.value, 0);
  assert.equal(JSON.parse(next.extraJSON).untouched_extra, false);
  next.prompt = "edited after import";
  assert.equal(
    out(next).v4_prompt.caption.base_caption,
    "edited after import" + suffix,
  );
});

test("unavailable groups and no metadata never reset editor values", () => {
  const meta = normalizeImageMetadata({
    Software: "Other editor",
    Description: "camera image",
  });
  assert.equal(meta.payload, null);
  assert.equal(Object.values(meta.available).some(Boolean), false);
  const current = defaults();
  assert.equal(applyMetadata(current, meta), current);
  assert.equal(applyMetadata(current, normalize({ seed: 0 }), off), current);
});

test("WebP EXIF UserComment JSON is recognized", () => {
  const content = join(
    bytes("ASCII\0\0\0"),
    bytes(JSON.stringify({ prompt: "exif room", uc: "blur", seed: 19 })),
    new Uint8Array(1),
  );
  const tiff = new Uint8Array(26 + content.length),
    view = new DataView(tiff.buffer);
  tiff.set(bytes("II"));
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 37510, true);
  view.setUint16(12, 7, true);
  view.setUint32(14, content.length, true);
  view.setUint32(18, 26, true);
  tiff.set(content, 26);
  const riffChunk = join(
    bytes("EXIF"),
    le32(tiff.length),
    tiff,
    new Uint8Array(tiff.length % 2),
  );
  const webp = join(
    bytes("RIFF"),
    le32(4 + riffChunk.length),
    bytes("WEBP"),
    riffChunk,
  );
  const parsed = parseExifImageMetadata(webp),
    meta = normalizeImageMetadata(parsed.raw, parsed);
  assert.equal(meta.prompt, "exif room");
  assert.equal(meta.seed, 19);
  assert.equal(meta.format, "WebP");
});

test("12 MiB source remains readable, oversized files are rejected before allocation", async () => {
  const file = new File(
    [
      png(
        textChunk(
          "Comment",
          JSON.stringify({ prompt: "large source", seed: 2 }),
        ),
      ),
      new Uint8Array(12 * 1024 * 1024),
    ],
    "upscaled.png",
  );
  assert.equal((await readImageMetadata(file)).prompt, "large source");
  await assert.rejects(
    () =>
      readImageMetadata({
        size: 65 * 1024 * 1024,
        arrayBuffer() {
          throw new Error("must not read");
        },
      }),
    /64 MiB/,
  );
});
