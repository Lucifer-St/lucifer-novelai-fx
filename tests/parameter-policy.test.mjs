import test from "node:test";
import assert from "node:assert/strict";
import { recoverParameterState } from "../src/lib/parameter-policy.mjs";
import {
  defaults,
  buildRequest,
  stateFromPayload,
  validateRequest,
} from "../src/lib/request.mjs";
import { normalizeImageMetadata, applyMetadata } from "../src/lib/metadata.mjs";

const internal = {
  uncond_scale: 1,
  extra_passthrough_testing: { debug: true },
  quality_boost: false,
  dynamic_thresholding_percentile: 0.999,
  dynamic_thresholding_mimic_scale: 10,
  skip_cfg_below_sigma: 0,
  cfg_sched_eligibility: "none",
  explike_fine_detail: false,
  minimize_sigma_inf: false,
  uncond_per_vibe: false,
  wonky_vibe_correlation: false,
};
const cleanState = () => ({
  ...defaults(),
  prompt: "a quiet garden",
  negative: "blurry",
  seed: 0,
});
test("legacy parameter recovery isolates all observed internal fields without clearing creative state", () => {
  const old = {
    ...cleanState(),
    parameterPolicyVersion: undefined,
    overrides: { ...internal, steps: 23, scale: 7, cfg_rescale: 0 },
    source: "local-image",
    mask: "local-mask",
    characters: [
      { id: "c", prompt: "blue coat", negative: "red coat", x: 0.2, y: 0.7 },
    ],
  };
  const before = structuredClone(old),
    result = recoverParameterState(old);
  assert.equal(result.removed.length, 11);
  assert.equal(result.state.prompt, old.prompt);
  assert.equal(result.state.negative, old.negative);
  assert.equal(result.state.seed, 0);
  assert.deepEqual(result.state.characters, old.characters);
  assert.equal(result.state.source, old.source);
  assert.equal(result.state.mask, old.mask);
  assert.deepEqual(old, before);
  const payload = buildRequest(result.state);
  validateRequest(result.state, payload);
  for (const name of Object.keys(internal)) {
    assert.equal(payload.novelai.body.parameters[name], undefined);
    assert.deepEqual(
      result.state.quarantinedParameters[name].value,
      internal[name],
    );
  }
  assert.equal(payload.novelai.body.parameters.steps, 23);
  assert.equal(payload.novelai.body.parameters.cfg_rescale, 0);
});
test("one-time JSON migration preserves values in quarantine and modern deliberate future JSON remains explicit", () => {
  const old = {
    ...cleanState(),
    parameterPolicyVersion: 0,
    extraJSON: JSON.stringify({ ...internal, steps: 24 }),
  };
  const fixed = recoverParameterState(old).state;
  assert.deepEqual(JSON.parse(fixed.extraJSON), { steps: 24 });
  assert.equal(recoverParameterState(fixed).changed, false);
  fixed.extraJSON = JSON.stringify({
    future_official_option: { enabled: true },
    extra_passthrough_testing: { debug: true },
    passthroughDebug: true,
  });
  const again = recoverParameterState(fixed).state;
  assert.deepEqual(JSON.parse(again.extraJSON), {
    future_official_option: { enabled: true },
  });
  assert.deepEqual(
    buildRequest(again).novelai.body.parameters.future_official_option,
    { enabled: true },
  );
});
test("new image imports retain unknown original metadata but never forward it automatically", () => {
  const raw = {
    Comment: JSON.stringify({
      ...internal,
      prompt: "garden",
      uc: "blur",
      seed: 0,
      steps: 25,
      width: 832,
      height: 1216,
    }),
  };
  const metadata = normalizeImageMetadata(raw, { format: "PNG" });
  assert.equal(metadata.parameters.extra_passthrough_testing, undefined);
  assert.equal(
    metadata.excludedParameters.extra_passthrough_testing.debug,
    true,
  );
  assert.equal(metadata.raw.Comment, raw.Comment);
  assert.ok(
    metadata.warnings.some((w) => w.includes("extra_passthrough_testing")),
  );
  const state = applyMetadata(cleanState(), metadata, {
    prompt: true,
    negative: true,
    characters: true,
    settings: true,
    seed: true,
  });
  assert.equal(state.prompt, "garden");
  assert.equal(state.seed, 0);
  assert.equal(state.steps, 25);
  assert.equal(
    state.quarantinedParameters.extra_passthrough_testing.value.debug,
    true,
  );
  const p = buildRequest(state).novelai.body.parameters;
  for (const name of Object.keys(internal)) assert.equal(p[name], undefined);
});
test("history restore cannot resurrect an upstream-rejected internal field", () => {
  const payload = buildRequest(cleanState());
  Object.assign(payload.novelai.body.parameters, internal);
  const original = structuredClone(payload);
  const restored = stateFromPayload(payload),
    wire = buildRequest(restored);
  assert.deepEqual(payload, original);
  assert.equal(
    wire.novelai.body.parameters.extra_passthrough_testing,
    undefined,
  );
  assert.equal(
    restored.quarantinedParameters.extra_passthrough_testing.value.debug,
    true,
  );
});
test("known blocked flags are removed even from newly entered explicit JSON", () => {
  const s = {
    ...cleanState(),
    extraJSON: JSON.stringify({
      extra_passthrough_testing: { x: 1 },
      passthroughDebug: 1,
      cfg_rescale: 0.2,
    }),
  };
  const p = buildRequest(s).novelai.body.parameters;
  assert.equal(p.extra_passthrough_testing, undefined);
  assert.equal(p.passthroughDebug, undefined);
  assert.equal(p.cfg_rescale, 0.2);
});
test("recovery leaves incomplete manual JSON intact for ordinary preflight error reporting", () => {
  const old = { ...cleanState(), extraJSON: '{"steps":' };
  const next = recoverParameterState(old).state;
  assert.equal(next.extraJSON, old.extraJSON);
  assert.throws(() => buildRequest(next), /格式错误/);
});
