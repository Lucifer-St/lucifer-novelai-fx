import schema from "../../shared/schema.json" with { type: "json" };

export const PARAMETER_POLICY_VERSION = 2;
const known = new Set(Object.keys(schema.imageParameters));
// Official production client removes these internal fields before sending.
export const NEVER_SEND_PARAMETERS = new Set([
  "extra_passthrough_testing",
  "passthroughDebug",
]);
export function partitionParameters(parameters = {}) {
  const accepted = {},
    excluded = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (known.has(key) && !NEVER_SEND_PARAMETERS.has(key))
      accepted[key] = value;
    else excluded[key] = value;
  }
  return { accepted, excluded };
}
export function explicitParameters(parameters = {}) {
  return Object.fromEntries(
    Object.entries(parameters).filter(
      ([key]) => !NEVER_SEND_PARAMETERS.has(key),
    ),
  );
}
export function quarantineEntries(parameters, source) {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [
      key,
      {
        value,
        source,
        reason: NEVER_SEND_PARAMETERS.has(key)
          ? "官方生产客户端会移除此内部调试字段，不能用于生成。"
          : "未收录于当前图像请求 schema，保留供查看，不自动发送。",
      },
    ]),
  );
}
export function recoverParameterState(state) {
  if (!state || typeof state !== "object")
    return { state, changed: false, removed: [] };
  const { accepted, excluded } = partitionParameters(state.overrides || {});
  const quarantine = {
    ...state.quarantinedParameters,
    ...quarantineEntries(excluded, "旧设置 / 历史参数"),
  };
  let extraJSON = state.extraJSON || "{}";
  let removed = Object.keys(excluded);
  try {
    const parsed = JSON.parse(extraJSON);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Older state may contain imported internals in either parameter container.
      const legacy = state.parameterPolicyVersion !== PARAMETER_POLICY_VERSION;
      const filtered = legacy
        ? partitionParameters(parsed).accepted
        : explicitParameters(parsed);
      const dropped = Object.fromEntries(
        Object.entries(parsed).filter(([key]) => !Object.hasOwn(filtered, key)),
      );
      if (Object.keys(dropped).length) {
        Object.assign(quarantine, quarantineEntries(dropped, "旧扩展 JSON"));
        removed.push(...Object.keys(dropped));
        extraJSON = JSON.stringify(filtered, null, 2);
      }
    }
  } catch {
    /* Preserve malformed manual JSON for normal preflight validation. */
  }
  removed = [...new Set(removed)];
  return {
    state: {
      ...state,
      overrides: accepted,
      extraJSON,
      quarantinedParameters: quarantine,
      parameterPolicyVersion: PARAMETER_POLICY_VERSION,
    },
    changed: removed.length > 0,
    removed,
  };
}
