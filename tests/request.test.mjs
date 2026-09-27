import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  buildRequest,
  validateRequest,
  stateFromPayload,
  exportPreset,
  parseObject,
  MODEL_ID,
} from "../src/lib/request.mjs";

const ready = () => ({ ...defaults(), prompt: "a quiet room", seed: 42 });
const params = (s) => buildRequest(s).novelai.body.parameters;

test("defaults remain V5 Full and unsupported models cannot silently change the requested model", () => {
  const state = defaults();
  assert.equal(state.model, MODEL_ID);
  assert.equal(state.noise_schedule, "karras");
  assert.equal(state.nativeModel, "nai-diffusion-5-full-inpainting");
  assert.throws(()=>defaults("nai-diffusion-4-full"),/不支持/);
  assert.throws(()=>buildRequest({ ...ready(), model: "nai-diffusion-4-full" }),/不支持/);
  assert.equal(
    buildRequest({ ...ready(), mode: "infill", nativeModel: "wrong" }).novelai
      .body.model,
    "nai-diffusion-5-full-inpainting",
  );
});

test("restored parameters no longer override edits to visible controls", () => {
  const source = ready();
  source.mode = "infill";
  source.source = "data:image/png;base64,b2xk";
  source.mask = "data:image/png;base64,bWFzaw==";
  source.overrides = {
    future_option: { enabled: true },
    img2img: { strength: 0.7, noise: 0.1, custom_flag: true },
  };
  const historical = buildRequest(source);
  historical.novelai.body.parameters.future_option =
    source.overrides.future_option;
  const restored = stateFromPayload(historical);
  Object.assign(restored, {
    prompt: "new room",
    negative: "new exclusion",
    width: 1024,
    height: 1024,
    seed: 8,
    steps: 30,
    scale: 4,
    source: "data:image/png;base64,bmV3",
    strength: 0.2,
    quality: false,
  });
  const output = buildRequest(restored),
    p = output.novelai.body.parameters;
  assert.equal(p.width, 1024);
  assert.equal(p.seed, 8);
  assert.equal(p.steps, 30);
  assert.equal(p.scale, 4);
  assert.equal(p.image, "bmV3");
  assert.equal(p.strength, 0.2);
  assert.equal(p.img2img.strength, 0.2);
  assert.equal(p.img2img.custom_flag, true);
  assert.equal(p.future_option, undefined);
  assert.deepEqual(restored.quarantinedParameters.future_option.value, {
    enabled: true,
  });
  assert.equal(output.novelai.body.input, "new room");
  assert.equal(p.v4_prompt.caption.base_caption, "new room");
  assert.equal(p.v4_negative_prompt.caption.base_caption, "new exclusion");
  assert.equal(p.tag_hint_qt, 0);
  assert.equal(restored.overrides.image, undefined);
  assert.equal(restored.overrides.width, undefined);
});

test("round trip preserves compound prompt flags and multiple centers while edits remain authoritative", () => {
  const payload = buildRequest(ready()),
    p = payload.novelai.body.parameters;
  const centers = [
    { x: 0.2, y: 0.3, label: "primary" },
    { x: 0.8, y: 0.9 },
  ];
  Object.assign(p.v4_prompt, { use_order: false, legacy_uc: true });
  p.v4_prompt.caption.custom_caption_flag = true;
  p.v4_prompt.caption.char_captions = [
    { char_caption: "old character", centers, custom_char_flag: "retained" },
  ];
  p.v4_negative_prompt.use_coords = true;
  p.v4_negative_prompt.caption.char_captions = [
    {
      char_caption: "old negative",
      centers: [
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.7 },
      ],
    },
  ];
  const restored = stateFromPayload(payload);
  assert.deepEqual(params(restored).v4_prompt, p.v4_prompt);
  assert.deepEqual(params(restored).v4_negative_prompt, p.v4_negative_prompt);
  restored.characters[0].prompt = "new character";
  restored.characters[0].negative = "new negative";
  restored.characters[0].x = 0.7;
  const result = params(restored);
  assert.equal(result.v4_prompt.use_order, false);
  assert.equal(result.v4_prompt.legacy_uc, true);
  assert.equal(
    result.v4_prompt.caption.char_captions[0].char_caption,
    "new character",
  );
  assert.deepEqual(result.v4_prompt.caption.char_captions[0].centers, [
    { x: 0.7, y: 0.3, label: "primary" },
    centers[1],
  ]);
  assert.equal(
    result.v4_negative_prompt.caption.char_captions[0].char_caption,
    "new negative",
  );
});

test("JSON scalar overrides update dependent captions, quality tags and hints", () => {
  const state = ready();
  state.overrides = { steps: 31, negative_prompt: "from field" };
  state.extraJSON = JSON.stringify({
    steps: 32,
    negative_prompt: "from JSON",
    qualityToggle: false,
  });
  const output = buildRequest(state),
    p = output.novelai.body.parameters;
  assert.equal(p.steps, 32);
  assert.equal(p.negative_prompt, "from JSON");
  assert.equal(p.v4_negative_prompt.caption.base_caption, "from JSON");
  assert.equal(output.novelai.body.input, state.prompt);
  assert.equal(p.tag_hint_qt, 0);
});

test("explicit compound captions and hint remain exact expert overrides", () => {
  const state = ready();
  const positive = {
    caption: { base_caption: "native positive", char_captions: [] },
    use_order: false,
  };
  const negative = {
    caption: { base_caption: "native negative", char_captions: [] },
    legacy_uc: true,
  };
  state.extraJSON = JSON.stringify({
    v4_prompt: positive,
    v4_negative_prompt: negative,
    negative_prompt: "other negative",
    tag_hint_qt: 3,
  });
  const p = params(state);
  assert.deepEqual(p.v4_prompt, positive);
  assert.deepEqual(p.v4_negative_prompt, negative);
  assert.equal(p.tag_hint_qt, 3);
});

test("seed resolution is explicit, cryptographic uint32 and respects fixed expert values", () => {
  const state = { ...ready(), seed: -1 };
  assert.equal(params(state).seed, -1);
  const seed = buildRequest(state, { resolveSeed: true }).novelai.body
    .parameters.seed;
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295);
  state.overrides = { seed: 4294967295 };
  assert.equal(
    buildRequest(state, { resolveSeed: true }).novelai.body.parameters.seed,
    4294967295,
  );
  state.overrides = { seed: -2 };
  assert.throws(
    () => validateRequest(state, buildRequest(state, { resolveSeed: true })),
    /Seed/,
  );
});

test("malformed JSON marker is rejected recursively before submission", () => {
  const state = ready();
  state.overrides = {
    upscale: { nested: [{ __studioInvalidJSON: "{unfinished" }] },
  };
  assert.throws(() => buildRequest(state), /JSON 尚未完成/);
  assert.throws(() => parseObject("[]"), /JSON 对象/);
  assert.throws(() => parseObject("{"), /格式错误/);
});

test("known schema types reject scalar, array and nested object mismatches", () => {
  for (const override of [
    { steps: "28" },
    { negative_prompt: 2 },
    { qualityToggle: "false" },
    { v4_prompt: [] },
    { v4_prompt: { caption: { base_caption: 42, char_captions: [] } } },
    { v4_prompt: { caption: { base_caption: "ok", char_captions: {} } } },
  ]) {
    const state = { ...ready(), overrides: override };
    assert.throws(
      () => validateRequest(state, buildRequest(state)),
      /类型错误/,
    );
  }
  const state = {
    ...ready(),
    overrides: {
      future_option: { new_field: [1, true, "ok"] },
      sampler: "future_sampler",
    },
  };
  assert.equal(validateRequest(state, buildRequest(state)).model, MODEL_ID);
});

test("blank prompt is not satisfied by automatically appended quality tags", () => {
  const state = { ...defaults(), seed: 0 };
  assert.throws(
    () => validateRequest(state, buildRequest(state)),
    /正面提示词/,
  );
  state.overrides = {
    v4_prompt: {
      caption: { base_caption: "explicit native prompt", char_captions: [] },
    },
  };
  assert.doesNotThrow(() => validateRequest(state, buildRequest(state)));
});

test("preset strips visible and nested hidden image data including JSON overrides", () => {
  const state = ready();
  state.source = "data:image/png;base64,c2VjcmV0";
  state.mask = "mask-secret";
  state.overrides = {
    image: "hidden-source",
    nested: {
      reference_image_multiple: ["vibe-secret"],
      unknown_picture: "data:image/png;base64,c2VjcmV0",
    },
    image_format: "webp",
    custom: 42,
  };
  state.extraJSON = JSON.stringify({
    director_reference_images: ["precise-secret"],
    custom: {
      mask: "hidden-mask",
      controlnet_condition: "control-secret",
      retained: "yes",
    },
  });
  state.vibes = [{ encoded: "binary-secret" }];
  const preset = exportPreset(state),
    text = JSON.stringify(preset);
  for (const secret of [
    "c2VjcmV0",
    "mask-secret",
    "hidden-source",
    "vibe-secret",
    "precise-secret",
    "hidden-mask",
    "control-secret",
    "binary-secret",
  ])
    assert.ok(!text.includes(secret), secret);
  assert.equal(preset.state.source, "");
  assert.equal(preset.state.mask, "");
  assert.equal(preset.state.overrides.image_format, "webp");
  assert.equal(preset.state.overrides.custom, 42);
  assert.equal(JSON.parse(preset.state.extraJSON).custom.retained, "yes");
});

test("legacy reference fields are discarded on restore and never auto-sent", () => {
  const payload = buildRequest(ready());
  payload.novelai.body.parameters.reference_image_multiple = ["old-vibe"];
  payload.novelai.body.parameters.director_reference_images = ["old-ref"];
  const restored = stateFromPayload(payload),
    p = params(restored);
  assert.deepEqual(restored.vibes, []);
  assert.deepEqual(restored.precise, []);
  assert.equal(p.reference_image_multiple, undefined);
  assert.equal(p.director_reference_images, undefined);
});

test("V5 character count and normalized coordinate bounds are enforced", () => {
  const character = {
    enabled: true,
    prompt: "character",
    negative: "",
    x: 0,
    y: 1,
  };
  const state = {
    ...ready(),
    characters: Array.from({ length: 32 }, () => ({ ...character })),
  };
  assert.doesNotThrow(() => validateRequest(state, buildRequest(state)));
  state.characters.push({ ...character });
  assert.throws(() => validateRequest(state, buildRequest(state)), /32 个角色/);
  state.characters = [{ ...character, x: 1.01 }];
  assert.throws(() => validateRequest(state, buildRequest(state)), /角色坐标/);
});

test("restoration tolerates absent optional fields and correctly identifies JPEG/WebP assets", () => {
  const payload = {
    novelai: {
      body: {
        model: MODEL_ID,
        action: "img2img",
        input: "test",
        parameters: { image: "/9j/abc", seed: 0 },
      },
    },
  };
  const state = stateFromPayload(payload);
  assert.equal(state.stream, false);
  assert.equal(state.width, 832);
  assert.equal(state.source, "data:image/jpeg;base64,/9j/abc");
  payload.novelai.body.parameters.image = "UklGRabc";
  assert.equal(
    stateFromPayload(payload).source,
    "data:image/webp;base64,UklGRabc",
  );
});
