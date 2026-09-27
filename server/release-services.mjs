const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 15_000;
const API_VERSION = "2026-03-10";
const MAX_RELEASE_NOTES = 6_000;
const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const OWNER = /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}(?<!-)$/;
const REPOSITORY = /^(?![.-])(?!.*\.git$)[A-Za-z0-9._-]{1,100}$/i;
const TEMPLATE = /^(?![.-])[A-Za-z0-9._-]{1,80}\.ya?ml$/i;
const ASSET_NAME = /^(?![.-])[A-Za-z0-9][A-Za-z0-9._ ()+-]{0,179}$/;

const DIAGNOSTIC_ALLOWLIST = Object.freeze({
  appVersion: value => normalizeVersion(value),
  latestVersion: value => normalizeVersion(value, {stable: true}),
  platform: value => oneOf(value, ["windows", "android", "unknown"]),
  architecture: value => oneOf(value, ["x64", "arm64", "x86", "unknown"]),
  installType: value => oneOf(value, ["portable", "native", "development", "unknown"]),
  releaseStatus: value => oneOf(value, ["unconfigured", "current", "update_available", "no_release", "network_error", "repository_error", "not_checked"]),
  updateChannel: value => value === "stable" ? value : null,
  provider: value => oneOf(value, ["official", "native", "openai", "not_configured", "unknown"]),
  featureLocation: value => oneOf(value, ["update_center", "generation", "prompt_editor", "image_import", "gallery", "history", "settings", "agent_mcp", "other"]),
  knownErrorCode: value => oneOf(value, ["gateway_connect_error", "gateway_connection_error", "gateway_timeout", "generation_busy", "invalid_request", "storage_error", "update_check_failed", "unknown"]),
});

export const FEEDBACK_DIAGNOSTIC_OPTIONS = Object.freeze({
  provider: Object.freeze(["official", "native", "openai", "not_configured", "unknown"]),
  featureLocation: Object.freeze(["update_center", "generation", "prompt_editor", "image_import", "gallery", "history", "settings", "agent_mcp", "other"]),
  knownErrorCode: Object.freeze(["none", "gateway_connect_error", "gateway_connection_error", "gateway_timeout", "generation_busy", "invalid_request", "storage_error", "update_check_failed", "unknown"]),
});

function oneOf(value, values) {
  return values.includes(value) ? value : null;
}

function normalizeVersion(value, {stable = false} = {}) {
  const match = SEMVER.exec(String(value || "").trim());
  if (!match || (stable && match[4])) return null;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}${match[4] ? `-${match[4]}` : ""}`;
}

function versionParts(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return null;
  const [core, prerelease] = normalized.split("-", 2);
  return {core: core.split(".").map(Number), prerelease: prerelease?.split(".") || null};
}

function compareIdentifier(left, right) {
  const leftNumber = /^\d+$/.test(left), rightNumber = /^\d+$/.test(right);
  if (leftNumber && rightNumber) return Number(left) === Number(right) ? 0 : Number(left) > Number(right) ? 1 : -1;
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) throw new TypeError("版本必须是 semver（例如 1.2.0 或 1.3.0-rc.1）。");
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease || !b.prerelease) return a.prerelease ? -1 : b.prerelease ? 1 : 0;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const compared = compareIdentifier(a.prerelease[index], b.prerelease[index]);
    if (compared) return compared;
  }
  return 0;
}

export function compareStableVersions(left, right) {
  if (!normalizeVersion(left, {stable: true}) || !normalizeVersion(right, {stable: true}))
    throw new TypeError("版本必须是稳定版 semver（例如 1.2.0）。");
  return compareVersions(left, right);
}

function normalizeRepository(value) {
  if (!value) return null;
  const input = typeof value === "string"
    ? (() => {
        const parts = value.split("/");
        return parts.length === 2 ? {owner: parts[0], repo: parts[1]} : null;
      })()
    : value;
  if (!input || typeof input !== "object") return null;
  const owner = String(input.owner || "").trim();
  const repo = String(input.repo || "").trim();
  if (!OWNER.test(owner) || !REPOSITORY.test(repo)) return null;
  const bugTemplate = TEMPLATE.test(String(input.bugTemplate || "")) ? input.bugTemplate : "bug_report.yml";
  const featureTemplate = TEMPLATE.test(String(input.featureTemplate || "")) ? input.featureTemplate : "feature_request.yml";
  return Object.freeze({owner, repo, bugTemplate, featureTemplate});
}

function repositoryLinks(repository, securityReportingEnabled) {
  if (!repository) return Object.freeze({releases: null, bug: null, improvement: null, security: null});
  const base = `https://github.com/${repository.owner}/${repository.repo}`;
  return Object.freeze({
    releases: `${base}/releases`,
    bug: `${base}/issues/new?template=${encodeURIComponent(repository.bugTemplate)}`,
    improvement: `${base}/issues/new?template=${encodeURIComponent(repository.featureTemplate)}`,
    security: securityReportingEnabled ? `${base}/security/advisories/new` : null,
  });
}

function githubAsset(asset, repository, tag) {
  if (!asset || typeof asset !== "object" || !ASSET_NAME.test(String(asset.name || ""))) return null;
  if (!Number.isSafeInteger(asset.size) || asset.size < 0) return null;
  let url;
  try { url = new URL(asset.browser_download_url); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null;
  let segments;
  try { segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return null; }
  const expected = [repository.owner, repository.repo, "releases", "download", tag, asset.name];
  if (segments.length !== expected.length || segments.some((part, index) => part !== expected[index])) return null;
  const sha256=/^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest||''))?.[1]?.toLowerCase()||null;
  return Object.freeze({name: asset.name, url: url.href, bytes: asset.size,sha256});
}

function githubRelease(payload, repository) {
  if (!payload || typeof payload !== "object" || payload.draft || payload.prerelease) return null;
  const version = normalizeVersion(payload.tag_name, {stable: true});
  if (!version) return null;
  const tag = String(payload.tag_name);
  const releaseUrl = `https://github.com/${repository.owner}/${repository.repo}/releases/tag/${encodeURIComponent(tag)}`;
  const assets = Array.isArray(payload.assets)
    ? payload.assets.map(asset => githubAsset(asset, repository, tag)).filter(Boolean)
    : [];
  const rawNotes = typeof payload.body === "string" ? payload.body.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") : "";
  const releaseNotesText = rawNotes.length > MAX_RELEASE_NOTES ? `${rawNotes.slice(0, MAX_RELEASE_NOTES)}\n…（更新说明已截断）` : rawNotes;
  return Object.freeze({version, tag, releaseUrl, assets, releaseNotesText, releaseNotesTruncated: rawNotes.length > MAX_RELEASE_NOTES});
}

function selectDownload(assets, platform) {
  if (platform === "android") return assets.find(asset => /(?:^|[-_. ])android(?:[-_. ]|$)/i.test(asset.name) && /(?:^|[-_. ])arm64(?:[-_. ]|$)/i.test(asset.name) && asset.name.toLowerCase().endsWith(".apk")) || null;
  return assets.find(asset => /(?:^|[-_. ])(?:windows|win)(?:[-_. ]|$)/i.test(asset.name) && /(?:^|[-_. ])(?:x64|amd64)(?:[-_. ]|$)/i.test(asset.name) && asset.name.toLowerCase().endsWith(".zip")) || null;
}

export function sanitizeFeedbackDiagnostics(input = {}) {
  const safe = {};
  for (const [key, normalize] of Object.entries(DIAGNOSTIC_ALLOWLIST)) {
    const value = normalize(input[key]);
    if (value !== null) safe[key] = value;
  }
  return Object.freeze(safe);
}

function baseResult(status, currentVersion, repository, platform, extra = {}) {
  return Object.freeze({
    status,
    configured: Boolean(repository),
    currentVersion,
    repository: repository ? `${repository.owner}/${repository.repo}` : null,
    ...extra,
    diagnostics: sanitizeFeedbackDiagnostics({
      appVersion: currentVersion,
      platform,
      releaseStatus: status,
      updateChannel: "stable",
      latestVersion: extra.latestVersion,
    }),
  });
}

export function createReleaseServices(options = {}) {
  const currentVersion = normalizeVersion(options.currentVersion);
  if (!currentVersion) throw new TypeError("currentVersion 必须是 semver。");
  const repository = normalizeRepository(options.repository);
  const securityReportingEnabled = options.securityReportingEnabled === true;
  const links = repositoryLinks(repository, securityReportingEnabled);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("缺少 fetch 实现。");
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(50, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const platform = oneOf(options.platform, ["windows", "android", "unknown"]) || "windows";

  function releaseInfo() {
    return Object.freeze({
      ...baseResult(repository ? "not_checked" : "unconfigured", currentVersion, repository, platform),
      links,
      feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
      message: repository
        ? "可主动检查 GitHub Releases 稳定版；检查不会上传本地内容。"
        : "发布仓库尚未配置；当前不会连接 GitHub。你仍可复制或导出反馈摘要。",
    });
  }

  async function checkUpdates() {
    if (!repository) return Object.freeze({
      ...baseResult("unconfigured", currentVersion, repository, platform),
      links,
      feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
      message: "发布仓库尚未配置，无法检查更新。",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("update_timeout")), timeoutMs);
    try {
      const aborted = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {once: true}));
      const request = Promise.resolve(fetchImpl(
        `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/latest`,
        {
          method: "GET",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "Lucifer-NovelAI-FX-Update-Check",
          },
        },
      ));
      const response = await Promise.race([
        request,
        aborted,
      ]);
      if (response.status === 404) {
        const repositoryResponse = await Promise.race([
          Promise.resolve(fetchImpl(`https://api.github.com/repos/${repository.owner}/${repository.repo}`, {
            method: "GET", redirect: "error", signal: controller.signal,
            headers: {Accept: "application/vnd.github+json", "X-GitHub-Api-Version": API_VERSION, "User-Agent": "Lucifer-NovelAI-FX-Update-Check"},
          })),
          aborted,
        ]);
        if (repositoryResponse.status === 404) return Object.freeze({
          ...baseResult("repository_error", currentVersion, repository, platform),
          links, feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
          message: "配置的发布仓库不存在或当前无法公开访问，请核对仓库配置。",
        });
        if (!repositoryResponse.ok) throw new Error(`github_repository_http_${repositoryResponse.status}`);
        return Object.freeze({
          ...baseResult("no_release", currentVersion, repository, platform),
          links, feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
          message: "仓库存在，但目前没有可用的稳定版 Release。",
        });
      }
      if (!response.ok) throw new Error(`github_http_${response.status}`);
      const release = githubRelease(await Promise.race([Promise.resolve(response.json()), aborted]), repository);
      if (!release) return Object.freeze({
        ...baseResult("no_release", currentVersion, repository, platform),
        links,
        feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
        message: "没有找到格式有效的稳定版 Release。",
      });
      const updateAvailable = compareVersions(release.version, currentVersion) > 0;
      const status = updateAvailable ? "update_available" : "current";
      const relation = compareVersions(currentVersion, release.version) > 0 ? "ahead" : updateAvailable ? "behind" : "equal";
      const download = selectDownload(release.assets, platform);
      return Object.freeze({
        ...baseResult(status, currentVersion, repository, platform, {latestVersion: release.version}),
        links,
        feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
        releaseUrl: release.releaseUrl,
        download: download ? {name: download.name, url: download.url, bytes: download.bytes,sha256:download.sha256} : null,
        releaseNotesText: release.releaseNotesText,
        releaseNotesTruncated: release.releaseNotesTruncated,
        versionRelation: relation,
        message: updateAvailable
          ? `发现稳定版 ${release.version}。可在应用内下载、校验并安装更新。`
          : relation === "ahead"
            ? `当前版本 ${currentVersion} 高于已发布稳定版 ${release.version}；暂未发现更高稳定版。`
            : `当前版本与最新稳定版一致（${currentVersion}）。`,
      });
    } catch {
      return Object.freeze({
        ...baseResult("network_error", currentVersion, repository, platform),
        links,
        feedbackOptions: FEEDBACK_DIAGNOSTIC_OPTIONS,
        message: "暂时无法连接 GitHub 检查更新；当前版本仍可继续使用。",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({releaseInfo, checkUpdates});
}
