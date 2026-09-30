import {createLibraryCleanup} from './library-cleanup.mjs';
import {createGenerationDuplicateGuard} from './generation-duplicate.mjs';
import {createAtlasStorage} from './atlas-storage.mjs';
import {createHistoryIndex} from './history-index.mjs';
import {createReferenceEncoding} from './reference-encoding.mjs';
import {MODEL_IDS,modelSpec,isV45,validateModelPayload} from '../src/lib/model-policy.mjs';
import {initializeCuratedLibrary} from './library.mjs';
import {createReleaseServices,createCachedReleaseCheck} from './release-services.mjs';
import {createDesktopFiles} from './desktop-files.mjs';
import {startResidentHost} from './resident-host.mjs';
import {createAppUpdater,assertUpdateStorage} from './app-updater.mjs';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';
import {atlasDocumentSource,atlasOriginal,atlasResource} from './atlas.mjs';
import {atlasDocument} from '../src/lib/atlas-embed.mjs';
import {agentSetup} from './agent-setup.mjs';
import http from "node:http";
import {createConfiguration,mapProviderRequest,normalizeProfile,OFFICIAL} from './configuration.mjs';
import {recoverInterruptedUsage} from './interrupted-usage.mjs';
import {stripImageMetadata} from './image-privacy.mjs';
import {summarizeUsage} from '../src/lib/opus-usage.mjs';
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import {createFeatures} from './features.mjs';
import {createLocalStore,FeatureError} from './local-store.mjs';
import {createGenerationJobs} from './generation-jobs.mjs';
import {createGatewayTransport,GENERATION_TIMEOUT_MS,GATEWAY_CONNECT_TIMEOUT_MS} from './gateway-transport.mjs';
import {
  nativeRecipe,
  recipeForImage,
  withStudioMetadata,
} from "./png-metadata.mjs";

export const GATEWAY = OFFICIAL;
const PROJECT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_OUTPUT = 64 * 1024 * 1024;
const MAX_IMAGE_TOTAL = 32 * 1024 * 1024;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".sse": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

class RequestError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code }, extra);
  }
}

function redact(text, key = "") {
  let value = String(text);
  if (key) value = value.split(key).join("[REDACTED]");
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = MAX_INPUT) {
  if (
    !String(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    throw new RequestError(
      415,
      "json_required",
      "请求必须使用 application/json。",
    );
  }
  if (Number(req.headers["content-length"]) > limit)
    throw new RequestError(
      413,
      "payload_too_large",
      "请求超过 15 MiB 本地上限，请减少参考图或图像尺寸。",
    );
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit)
      throw new RequestError(
        413,
        "payload_too_large",
        "请求超过 15 MiB 本地上限，请减少参考图或图像尺寸。",
      );
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new RequestError(400, "invalid_json", "请求需要有效的 JSON 对象。");
  }
}

function nativeRouteAllowed(route) {
  if (
    typeof route !== "string" ||
    !route.startsWith("/") ||
    /[\\?#%\u0000-\u0020]/.test(route) ||
    route.includes("//") ||
    path.posix.normalize(route) !== route ||
    route.endsWith("/")
  )
    return false;
  return (
    /^\/ai\/[^/]+(?:\/[^/]+)*$/.test(route) ||
    route === "/user/subscription" ||
    /^\/novelai\/(?:image|text|primary)\/(?:ai\/[^/]+(?:\/[^/]+)*|oa\/v1\/[^/]+(?:\/[^/]+)*|user\/subscription)$/.test(
      route,
    )
  );
}

function imageExtension(bytes) {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return ".png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return ".jpg";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return ".webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6)))
    return ".gif";
  return null;
}

function decodeImage(value) {
  if (typeof value !== "string") return null;
  const encoded = value
    .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")
    .replace(/\s/g, "");
  if (
    encoded.length < 8 ||
    encoded.length > MAX_OUTPUT ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    return null;
  const bytes = Buffer.from(encoded, "base64");
  return imageExtension(bytes) ? bytes : null;
}

function collectImages(value, result = [], depth = 0) {
  if (!value || depth > 8 || result.length >= 32) return result;
  if (Array.isArray(value))
    for (const child of value) collectImages(child, result, depth + 1);
  else if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        ["b64_json", "image", "image_base64", "image_data", "output"].includes(
          key,
        ) &&
        typeof child === "string"
      ) {
        const bytes = decodeImage(child);
        if (bytes) result.push(bytes);
      } else if (child && typeof child === "object")
        collectImages(child, result, depth + 1);
    }
  }
  return result;
}

function parseSSEBlock(block) {
  const lines = block.split(/\r?\n/);
  const event =
    lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim() || "";
  const text = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!text) return null;
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { event, data };
}

function finalStreamImages(raw, rawUrl, expectedSamples = 1) {
  const finals = new Map();
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const parsed = parseSSEBlock(block);
    if (!parsed || !parsed.data || typeof parsed.data !== "object") continue;
    const value = parsed.data;
    // Current NovelAI carries event_type in data. Older SSE clients use an
    // explicit event: final/error header; untyped image events are not finals.
    const type = value.event_type || parsed.event;
    if (type === "error") {
      const detail =
        typeof value.error === "string"
          ? value.error
          : value.error?.message ||
            value.message ||
            value.detail ||
            "NovelAI 在流中返回错误。";
      throw new RequestError(
        502,
        "novelai_stream_error",
        `${String(detail).slice(0, 1000)} 生成与计费状态需核对，请勿自动重试。`,
        { billingUnknown: true, rawUrl },
      );
    }
    if (type !== "final") continue;
    const images = collectImages(value);
    const sample =
      Number.isInteger(value.samp_ix) && value.samp_ix >= 0 ? value.samp_ix : 0;
    images.forEach((bytes, index) => finals.set(sample + index, bytes));
  }
  if (finals.size < expectedSamples) {
    throw new RequestError(
      502,
      "incomplete_image_stream",
      `图像流已结束，但只收到 ${finals.size}/${expectedSamples} 张明确标记的最终图；原始流已保留，生成与计费状态需核对。`,
      { billingUnknown: true, rawUrl },
    );
  }
  return [...finals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bytes]) => bytes);
}

function summary(payload, route) {
  const prompt = payload?.prompt || payload?.novelai?.body?.input || "";
  return {
    model: payload?.model || payload?.novelai?.body?.model || "",
    prompt: typeof prompt === "string" ? prompt.slice(0, 8192) : "",
    endpoint: payload?.novelai?.endpoint || route,
    action: payload?.novelai?.body?.action || payload?.novelai?.action || "",
  };
}

export function createStudioServer(options = {}) {
  const releaseServices=createReleaseServices({currentVersion:RELEASE_CONFIG.version,repository:options.releaseRepository===undefined?RELEASE_CONFIG.repository:options.releaseRepository,securityReportingEnabled:RELEASE_CONFIG.securityReportingEnabled,fetchImpl:options.releaseFetchImpl??globalThis.fetch,platform:'windows'});
  const runtimeRoot=options.root||process.env.FX_SHARE_ROOT||PROJECT;
  const dataDir = options.dataDir || path.join(runtimeRoot, "userdata");
  const desktopFiles=options.desktopFiles||createDesktopFiles({cacheDir:path.join(dataDir,'desktop-tools')});
  const updater=createAppUpdater({root:runtimeRoot,dataDir,currentVersion:RELEASE_CONFIG.version,installId:options.installId??process.env.FX_SHARE_INSTALL_ID,releaseServices,fetchImpl:options.releaseFetchImpl??globalThis.fetch,...options.updaterOptions});
  const checkRelease=createCachedReleaseCheck(releaseServices.checkUpdates);
  const configuration=createConfiguration({directory:path.join(dataDir,"config"),root:runtimeRoot,vault:options.vault});
  const resultDir = path.join(dataDir, "results");
  const historyDir = path.join(dataDir, "history");
  const historyStore = createLocalStore(historyDir);
  const duplicateGuard=createGenerationDuplicateGuard({historyDir,resultDir});
  const generatedLibrary=createHistoryIndex({dataDir,historyDir,resolveImage:image=>imageSource(image)});
  const referenceEncoding=createReferenceEncoding({directory:path.join(dataDir,'reference-encoding'),encode:async({model,image,information_extracted,requestId})=>{
    const entry=await generationLease(()=>callGateway('/v1/images/generations',{body:{model,novelai:{endpoint:'/ai/encode-vibe',response:'raw',body:{model,image,information_extracted}}},metadata:{operation:'vibe-encode',encodingRequestId:requestId}}));
    if(!entry.rawUrl?.endsWith('.bin'))throw Object.assign(Error('编码未返回预期二进制结果；请保留原任务，不要重复付费。'),{billingUnknown:true});
    return (await readFile(path.join(resultDir,decodeURIComponent(entry.rawUrl.split('/').at(-1))))).toString('base64');
  }});
  const atlasStorage=createAtlasStorage(path.join(dataDir,'atlas'));
  let autoSaveOutput = true;
  let outputDir = path.resolve(options.outputDir || path.join(dataDir,"output"));
  let saveDir = path.resolve(options.saveDir || path.join(dataDir,"saved"));
  let storageRoots=[];
  async function refreshStorage(){const cfg=await configuration.get();autoSaveOutput=cfg.autoSaveOutput!==false;outputDir=options.outputDir||cfg.outputDirectory;saveDir=options.saveDir||cfg.saveDirectory;storageRoots=cfg.storageRoots||[];return cfg;}
  const saveLocks = new Map();
  const distDir = options.distDir || path.join(PROJECT, "dist");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const transports=new Map();
  const gatewayFetch=options.fetchImpl||((url,init)=>{const origin=new URL(url).origin;if(!transports.has(origin))transports.set(origin,createGatewayTransport({origin}));return transports.get(origin).fetch(url,init);});
  const timeoutMs = options.timeoutMs || GENERATION_TIMEOUT_MS;
  const maxInput = options.maxInput || MAX_INPUT;
  const maxOutput = options.maxOutput || MAX_OUTPUT;
  const ready = Promise.all([
    mkdir(resultDir, { recursive: true }),
    mkdir(historyDir, { recursive: true }),
  ]);
  let generationBusy=false,storageChanging=false;
  let shuttingDown=false,inflightMutations=0;
  async function generationLease(run){
    if(storageChanging)throw new RequestError(409,'storage_busy','保存目录正在更新，请稍后再生成。');
    if(generationBusy)throw new RequestError(409,'generation_busy','另一张图片仍在生成，请等待完成。');
    generationBusy=true;try{return await run();}finally{generationBusy=false;}
  }
  const features=createFeatures({dataDir,fetchImpl,
    generate:(payload,comparison)=>generationLease(async()=>{
      const result=await callGateway('/v1/images/generations',{body:payload,metadata:{comparison}});
      if(!result.images?.length)throw new RequestError(502,'missing_comparison_image','请求结束但未取得图片；已停止后续对照任务。',{billingUnknown:true});
      return result;
    })});
  const generationJobs=createGenerationJobs({directory:path.join(dataDir,'generation-jobs'),timeoutMs:options.generationJobTimeoutMs||timeoutMs,isBusy:()=>storageChanging||generationBusy||!!features.comparisons.active,
    authorizeBatch:async()=>{if((await features.anlas.get()).pricingPolicy==='paid')throw new RequestError(400,'opus_unavailable','当前计数规则是付费 / 额度用尽，不能提交 Opus 逐张模式。');},
    run:(payload,job)=>generationLease(()=>callGateway('/v1/images/generations',{body:payload,metadata:job.batch?{batch:job.batch}:undefined,signal:job.signal,onProgress:job.onProgress,onEvent:job.onEvent,preventDuplicate:job.preventDuplicate,requestTimeoutMs:job.timeoutMs}))});
  const libraryCleanup=createLibraryCleanup({dataDir,historyStore,index:generatedLibrary,paths:async()=>{await refreshStorage();return {resultDir,outputDir,storageRoots};},lease:async(run,automatic)=>{
    if(storageChanging||generationBusy||generationJobs.active||features.comparisons.active||inflightMutations>(automatic?0:1))throw new RequestError(409,'generation_busy','生成或其他操作期间不能清理图库，请等待任务结束。');
    storageChanging=true;try{await generatedLibrary.settle();return await run();}finally{storageChanging=false;}
  }});
  const cleanupTimer=setInterval(()=>{if(!shuttingDown)void libraryCleanup.automatic();},options.cleanupIntervalMs||60000);cleanupTimer.unref();
  const materialsReady=(async()=>{await ready;await generationJobs.ready;await features.comparisons.list();await recoverInterruptedUsage(dataDir,features.anlas);await initializeCuratedLibrary({dataDir,bundlePath:path.join(PROJECT,'public','curated','library.json')});})();

  const loadKey=()=>configuration.key();

  async function save(name, bytes) {
    await ready;
    await writeFile(path.join(resultDir, name), bytes, { flag: "wx" });
    return `/api/results/${encodeURIComponent(name)}`;
  }

  async function saveHistory(entry) {
    await ready;
    await historyStore.write(`${entry.id}.json`, entry);
    void generatedLibrary.indexEntry(entry).catch(()=>{});
  }

  const validId = (id) =>
    typeof id === "string" && /^\d+-[a-f0-9]{8}$/.test(id);
  const internalImageName = /^\d+-[a-f0-9]{8}-\d+\.(?:png|jpg|webp|gif)$/;
  const outputImageName =
    /^(?:V5Full|V45Full|V45Curated)-[\dT_-]+-seed(?:\d+|unknown)-[a-f0-9]{8}-\d+(?:-\d+)?\.(?:png|jpg|webp|gif)$/;
  function trustedImagePath(image, prefix, directories) {
    const name = image?.[`${prefix}Name`];
    const recordedPath = image?.[`${prefix}Path`];
    if (
      typeof name !== "string" ||
      typeof recordedPath !== "string" ||
      !(
        outputImageName.test(name) ||
        (name === image.name && internalImageName.test(name))
      )
    )
      return null;
    const resolved = path.resolve(recordedPath);
    return directories.includes(path.dirname(resolved)) &&
      path.basename(resolved) === name
      ? resolved
      : null;
  }

  async function existingFile(candidates) {
    for (const candidate of new Set(candidates.filter(Boolean))) {
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
      }
    }
    return null;
  }

  async function imageSource(image) {
    if(image?.deletedAt)return null;
    return existingFile([
      // Portable userdata may have moved while history still holds its old absolute path.
      outputImageName.test(image.outputName||'')?path.join(outputDir,image.outputName):null,
      outputImageName.test(image.savedName||'')?path.join(saveDir,image.savedName):null,
      trustedImagePath(image, "output", [outputDir, resultDir,...storageRoots]),
      // Before output/save were separated, savedPath denoted automatic storage.
      trustedImagePath(image, "saved", [saveDir, outputDir, resultDir,...storageRoots]),
      path.join(resultDir, image.name),
    ]);
  }

  async function historyEntry(id) {
    if (!validId(id))
      throw new RequestError(400, "invalid_result", "无效的历史记录 ID。");
    await ready;
    const entry = JSON.parse(
      await readFile(path.join(historyDir, `${id}.json`), "utf8"),
    );
    if (entry.id !== id || !Array.isArray(entry.images))
      throw new RequestError(404, "not_found", "找不到这次生成记录。");
    return entry;
  }

  async function resultFile(name) {
    const match = /^(\d+-[a-f0-9]{8})-\d+\.(?:png|jpg|webp|gif)$/.exec(name);
    if (match) {
      try {
        const entry = await historyEntry(match[1]);
        const image = entry.images.find((item) => item.name === name);
        if (image) {
          // An explicitly saved legacy image may contain newly added metadata;
          // prefer that copy for downloads while retaining the automatic source.
          const source =
            (await existingFile([
              trustedImagePath(image, "saved", [saveDir]),
            ])) || (await imageSource(image));
          if (source) return source;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return path.join(resultDir, name);
  }

  async function writeOutput(bytes, entry, index, seed, directory) {
    await mkdir(directory, { recursive: true });
    const date = entry.createdAt.replace(/[:.Z]/g, "-").replace(/-$/, "");
    const prefix=String(entry.model).includes('4-5-curated')?'V45Curated':String(entry.model).includes('4-5-full')?'V45Full':'V5Full';
    const base = `${prefix}-${date}-seed${Number.isInteger(seed) && seed >= 0 ? seed : "unknown"}-${entry.id.split("-").at(-1)}-${index + 1}`;
    const extension = imageExtension(bytes);
    for (let collision = 0; collision < 1000; collision++) {
      const savedName = `${base}${collision ? `-${collision + 1}` : ""}${extension}`;
      const savedPath = path.join(directory, savedName);
      try {
        await writeFile(savedPath, bytes, { flag: "wx" });
        return { savedName, savedPath };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    throw new Error("Unable to reserve a unique output filename");
  }

  function outputWarning(entry) {
    const message = `自动输出目录 ${outputDir} 暂时无法写入；图片已保留在项目 data/results，仍可预览或点击保存到收藏目录，不需要重新生成。`;
    if (!(entry.warnings || []).includes(message))
      (entry.warnings ||= []).push(message);
  }

  function prepareImage(bytes, payload, key, index, entry) {
    let recipe = nativeRecipe(payload, key);
    if(entry.comparison)recipe.studio_comparison=entry.comparison;
    if(entry.postprocess)recipe.studio_postprocess=entry.postprocess;
    try {
      recipe = recipeForImage(bytes, recipe, index);
      if (index > 0 && recipe.parameters.seed === undefined)
        (entry.warnings ||= []).push(
          `第 ${index + 1} 张图未提供独立 seed；导入时保留其他参数，不猜测 seed。`,
        );
      return {
        bytes: withStudioMetadata(bytes, recipe),
        seed: recipe.parameters.seed,
      };
    } catch {
      (entry.warnings ||= []).push(
        "此图的 PNG 元数据未能写入，已保留原图；完整参数仍可从历史记录恢复。",
      );
      return { bytes, seed: recipe.parameters.seed };
    }
  }

  async function persistImage(bytes, entry, index, payload, key) {
    const prepared = prepareImage(bytes, payload, key, index, entry);
    const name = `${entry.id}-${index + 1}${imageExtension(bytes)}`;
    const image = {
      name,
      url: `/api/results/${encodeURIComponent(name)}`,
      savedToLibrary: false,
    };
    // Keep a durable history cache without creating an output-directory copy.
    if(!autoSaveOutput){image.url=await save(name,prepared.bytes);return image;}
    try {
      const written = await writeOutput(
        prepared.bytes,
        entry,
        index,
        prepared.seed,
        outputDir,
      );
      image.outputName = written.savedName;
      image.outputPath = written.savedPath;
    } catch {
      image.url = await save(name, prepared.bytes);
      image.outputName = name;
      image.outputPath = path.join(resultDir, name);
      outputWarning(entry);
    }
    return image;
  }

  async function saveResult(id, index) {
    if(storageChanging)throw new RequestError(409,'storage_busy','保存目录正在更新，请稍后再保存。');
    await refreshStorage();
    if (!validId(id) || !Number.isInteger(index) || index < 0 || index > 31)
      throw new RequestError(
        400,
        "invalid_result",
        "请选择有效的历史记录与图片序号。",
      );
    // Different images in one generation share a history file; serialize that whole record.
    const lockKey = id;
    const preceding = saveLocks.get(lockKey) || Promise.resolve();
    const current = preceding
      .catch(() => {})
      .then(async () => {
        const entry = await historyEntry(id);
        const image = entry.images[index];
        if (!image || !internalImageName.test(image.name))
          throw new RequestError(404, "not_found", "历史记录中没有这张图片。");
        const existingSaved = await existingFile([
          trustedImagePath(image, "saved", [saveDir]),
        ]);
        if (existingSaved) {
          // A legacy auto-saved file is already in the requested directory.
          // Record the user's explicit choice without making another copy.
          if (image.savedToLibrary !== true) {
            image.savedToLibrary = true;
            await saveHistory(entry);
          }
          return { id, index, image, alreadySaved: true, warnings: [] };
        }
        const source = await imageSource(image);
        if (!source)
          throw new RequestError(
            404,
            "image_missing",
            "原图文件已不存在，无法保存。请检查自动输出目录或历史记录中的图片位置。",
          );
        const original = await readFile(source);
        let payload = {};
        try {
          payload = JSON.parse(
            await readFile(path.join(resultDir, `${id}-request.json`), "utf8"),
          );
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        let key = "";
        try {
          key = await loadKey();
        } catch {}
        const operation = { ...entry, warnings: [] };
        const prepared = prepareImage(original, payload, key, index, operation);
        try {
          Object.assign(
            image,
            await writeOutput(
              prepared.bytes,
              entry,
              index,
              prepared.seed,
              saveDir,
            ),
          );
        } catch {
          throw new RequestError(
            503,
            "save_directory_unavailable",
            `无法写入保存目录 ${saveDir}，本次没有保存成功；原始输出仍保留，请检查目录后再点击保存。`,
          );
        }
        // Keep a legacy automatic/fallback source recoverable after savedPath
        // is repurposed for the user's library copy.
        if (
          !trustedImagePath(image, "output", [outputDir, resultDir]) &&
          [outputDir, resultDir].includes(path.dirname(source))
        ) {
          image.outputName = path.basename(source);
          image.outputPath = source;
        }
        image.savedToLibrary = true;
        if (operation.warnings.length)
          entry.warnings = [
            ...new Set([...(entry.warnings || []), ...operation.warnings]),
          ];
        await saveHistory(entry);
        return {
          id,
          index,
          image,
          alreadySaved: false,
          warnings: operation.warnings,
        };
      });
    saveLocks.set(lockKey, current);
    try {
      return await current;
    } finally {
      if (saveLocks.get(lockKey) === current) saveLocks.delete(lockKey);
    }
  }

  async function consume(response, onChunk) {
    const declared = Number(response.headers.get("content-length"));
    if (declared > maxOutput) {
      await response.body?.cancel();
      throw new RequestError(
        502,
        "response_too_large",
        "网关响应超过本地 64 MiB 上限。",
        { billingUnknown: true },
      );
    }
    const chunks = [];
    let size = 0;
    if (response.body)
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxOutput)
          throw new RequestError(
            502,
            "response_too_large",
            "网关响应超过本地 64 MiB 上限。",
            { billingUnknown: true },
          );
        chunks.push(Buffer.from(chunk));
        if (onChunk) onChunk(chunk);
      }
    return Buffer.concat(chunks);
  }

  async function callGateway(
    route,
    {
      method = "POST",
      body,
      query,
      req,
      res,
      stream = false,
      persist = true,
      requestTimeoutMs = timeoutMs,
      signal,
      onProgress,
      onEvent,
      metadata = {},
      preventDuplicate = false,
    } = {},
  ) {
    // The current aggregator charges suggest-tags through its image wrapper.
    // Block every local entry point, including old browser bundles and Tools/API.
    if (body?.novelai?.endpoint === '/ai/generate-image/suggest-tags' || route.endsWith('/ai/generate-image/suggest-tags'))
      throw new RequestError(409, 'remote_tags_disabled', '分享版仅提供本地 Danbooru 词库补全，不提交远程关联词请求。', {billingUnknown:false});
    const endpoint=body?.novelai?.endpoint||(route==='/v1/images/generations'?'/ai/generate-image':route);
    if(['/ai/generate-image','/ai/generate-image-stream'].includes(endpoint)){
      try{const native=body?.novelai?.body||body;validateModelPayload(body?.novelai?body:{model:modelSpec(native.model).id,novelai:{endpoint,body:native}});}catch(e){throw new RequestError(400,'model_capability',e.message,{billingUnknown:false});}
    }
    if(endpoint==='/ai/encode-vibe')try{const id=body?.novelai?.body?.model||body?.model;if(!isV45(id)||body?.novelai&&body.model!==modelSpec(id).id)throw Error('Vibe 编码仅用于 V4.5，内外层模型须一致。');}catch(e){throw new RequestError(400,'model_capability',e.message,{billingUnknown:false});}
    const profile=await refreshStorage();
    await duplicateGuard.ready();
    if(preventDuplicate)try{await duplicateGuard.assertAllowed(body,endpoint);}catch(e){throw new RequestError(e.status||409,e.code,e.message,{billingUnknown:false});}
    const key = await loadKey();
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    const entry = {
      id,
      images: [],
      createdAt: new Date().toISOString(),
      ...summary(body, route),
      status: "success",
      ...metadata,
    };
    const controller = new AbortController();
    let abortedByClient = false;
    let timedOut = false;
    let contacted = false;
    const chargeable=method!=='GET'&&body?.novelai?.endpoint!=='/ai/generate-image/suggest-tags';
    const transport={phase:'preparing',receivedBytes:0,startedAt:new Date(started).toISOString(),timeoutMs:requestTimeoutMs};
    const report=patch=>{Object.assign(transport,patch);entry.diagnostics={...transport,elapsedMs:Date.now()-started};try{onProgress?.({...entry.diagnostics});}catch{}};
    const externalAbort=()=>controller.abort();signal?.addEventListener('abort',externalAbort,{once:true});if(signal?.aborted)controller.abort();
    const onClose = () => {
      if (!res.writableEnded) {
        abortedByClient = true;
        controller.abort();
      }
    };
    res?.once("close", onClose);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    const emit = (event) => {
      try{onEvent?.(event);}catch{}
      if (stream && res && !res.destroyed && !res.writableEnded)
        res.write(`${JSON.stringify(event)}\n`);
    };
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      emit({ type: "start", id });
    }
    try {
      const mapped=mapProviderRequest(profile,route,body,method);
      const target=mapped.url;
      if (query)
        for (const [name, value] of Object.entries(query)) {
          for (const item of Array.isArray(value) ? value : [value]) {
            if (!["string", "number", "boolean"].includes(typeof item))
              throw new RequestError(
                400,
                "invalid_query",
                "query 参数只能是字符串、数字、布尔值或它们的数组。",
              );
            target.searchParams.append(name, String(item));
          }
        }
      if (persist && body !== undefined)
        entry.requestUrl = await save(
          `${id}-request.json`,
          redact(JSON.stringify(body, null, 2), key),
        );
      controller.signal.throwIfAborted();contacted = true;
      report({phase:'connecting',submittedAt:new Date().toISOString()});
      const response = await gatewayFetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "*/*",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: mapped.body !== undefined ? JSON.stringify(mapped.body) : undefined,
        redirect: "manual",
        signal: controller.signal,
      });
      entry.requestId = response.headers.get("x-request-id")
        ? redact(response.headers.get("x-request-id"), key)
        : undefined;
      entry.upstreamRequestId = response.headers.get("x-upstream-request-id")
        ? redact(response.headers.get("x-upstream-request-id"), key)
        : undefined;
      entry.aggregationRequestId=response.headers.get('x-oneapi-request-id')?redact(response.headers.get('x-oneapi-request-id'),key):undefined;
      entry.upstreamStatus = response.status;
      entry.contentType =
        response.headers.get("content-type") || "application/octet-stream";
      const declaredLength=Number(response.headers.get('content-length'));
      const expectedBytes=Number.isSafeInteger(declaredLength)&&declaredLength>0&&!response.headers.get('content-encoding')?declaredLength:undefined;
      report({phase:'waiting_result',headersAt:new Date().toISOString(),upstreamStatus:response.status,requestId:entry.requestId,aggregationRequestId:entry.aggregationRequestId,expectedBytes});
      const isSSE = entry.contentType.includes("text/event-stream");
      let ssePending = "";
      const decoder = new TextDecoder();
      const onChunk =
        (stream || onEvent) && isSSE
          ? (chunk) => {
              ssePending += decoder.decode(chunk, { stream: true });
              const blocks = ssePending.split(/\r?\n\r?\n/);
              ssePending = blocks.pop() || "";
              for (const block of blocks) {
                const event = parseSSEBlock(redact(block, key));
                if (event)
                  emit({
                    type: "event",
                    data: event.data,
                    ...(event.event ? { event: event.event } : {}),
                  });
              }
            }
          : undefined;
      let meaningful=false;
      const bytes = await consume(response, chunk=>{if(!meaningful&&Buffer.from(chunk).toString('utf8').trim())meaningful=true;report({phase:meaningful?'receiving':'waiting_result',firstByteAt:transport.firstByteAt||new Date().toISOString(),receivedBytes:transport.receivedBytes+chunk.length,lastByteAt:new Date().toISOString()});onChunk?.(chunk);});
      report({phase:'decoding',responseCompleteAt:new Date().toISOString()});
      if (!response.ok) {
        const raw = bytes.toString("utf8").slice(0, 8192);
        let detail;
        try {
          detail = JSON.parse(raw);
        } catch {}
        const upstreamError = detail?.error;
        let message =
          typeof upstreamError === "string"
            ? upstreamError
            : upstreamError?.message || detail?.message;
        if (!message && !/<(?:html|!doctype)/i.test(raw))
          message = raw.trim().slice(0, 1000);
        message ||= `网关返回 HTTP ${response.status}。`;
        if (response.status === 404 && route !== "/v1/images/generations")
          message +=
            " 当前聚合入口可能未开放此原生路径；图像功能请使用 OpenAI 图像封装端点。";
        throw new RequestError(
          response.status >= 300 && response.status < 400
            ? 502
            : response.status,
          upstreamError?.code || "gateway_error",
          redact(message, key),
          {
            requestId: entry.requestId,
            upstreamStatus: response.status,
            retryAfter: response.headers.get("retry-after") || undefined,
            billingUnknown: response.status >= 500,
          },
        );
      }
      const contentType = entry.contentType.toLowerCase();
      const directImageExt = imageExtension(bytes);
      let imageBytes = [];
      if(endpoint==='/ai/encode-vibe'&&!contentType.includes('json'))entry.rawUrl=await save(`${id}.bin`,bytes);
      else if (directImageExt) imageBytes.push(bytes);
      else if (
        bytes.length >= 4 &&
        bytes[0] === 80 &&
        bytes[1] === 75 &&
        bytes[2] === 3 &&
        bytes[3] === 4
      ) {
        entry.rawUrl = await save(`${id}.zip`, bytes);
        let total = 0;
        let count = 0;
        try {
          const files = unzipSync(bytes, {
            filter(file) {
              if (!/\.(?:png|jpe?g|webp|gif)$/i.test(file.name)) return false;
              total += file.originalSize;
              count++;
              if (count > 32 || total > MAX_IMAGE_TOTAL)
                throw new Error("oversized archive");
              return true;
            },
          });
          imageBytes = Object.values(files)
            .map((value) => Buffer.from(value))
            .filter((value) => imageExtension(value));
        } catch {
          throw new RequestError(
            502,
            "invalid_archive",
            "响应 ZIP 无法安全解析；原始响应已保留。",
            { billingUnknown: true, rawUrl: entry.rawUrl },
          );
        }
      } else if (
        contentType.includes("json") ||
        /^[\s\r\n]*[\[{]/.test(bytes.toString("utf8", 0, 40))
      ) {
        const raw = redact(bytes.toString("utf8"), key);
        try {
          const value = JSON.parse(raw);
          imageBytes = collectImages(value);
          if (Array.isArray(value?.data))
            for (const item of value.data) {
              if (typeof item.url !== "string") continue;
              let url;
              try {
                url = new URL(item.url);
              } catch {
                continue;
              }
              if (
                url.origin !== new URL(profile.baseURL).origin ||
                !url.pathname.startsWith("/v1/images/files/") ||
                url.username ||
                url.password
              ) {
                (entry.warnings ||= []).push(
                  "返回了非固定网关域名的图片 URL，未自动下载；完整响应已保存。",
                );
                continue;
              }
              try {
                const imageResponse = await gatewayFetch(url, {
                  redirect: "manual",
                  signal: controller.signal,
                  headers: { Accept: "image/*" },
                });
                if (!imageResponse.ok) {
                  (entry.warnings ||= []).push(
                    `结果图片下载失败（HTTP ${imageResponse.status}），已保留响应 URL。`,
                  );
                  continue;
                }
                const result = await consume(imageResponse);
                if (imageExtension(result)) imageBytes.push(result);
                else
                  (entry.warnings ||= []).push(
                    "结果 URL 未返回可识别的图片，完整响应已保存。",
                  );
              } catch {
                (entry.warnings ||= []).push(
                  "网关已返回生成结果，但图片下载未完成；完整响应 URL 已保存，请勿重复生成。",
                );
              }
            }
          // Large image data is available in the saved response, not duplicated in browser history.
          if (!imageBytes.length && raw.length <= 1024 * 1024)
            entry.json = value;
          entry.rawUrl = persist
            ? await save(`${id}-response.json`, raw)
            : undefined;
          if (!persist) entry.json = value;
        } catch (error) {
          if (error instanceof RequestError) throw error;
          throw new RequestError(
            502,
            "invalid_gateway_json",
            "网关返回的 JSON 无法解析。",
            { billingUnknown: true },
          );
        }
      } else if (isSSE || contentType.startsWith("text/")) {
        const raw = redact(bytes.toString("utf8"), key);
        entry.rawText = raw.slice(0, 65536);
        entry.rawTextTruncated = raw.length > 65536;
        entry.rawUrl = persist
          ? await save(`${id}${isSSE ? ".sse" : ".txt"}`, raw)
          : undefined;
        if (isSSE) {
          const endpoint = body?.novelai?.endpoint || route;
          if (endpoint.endsWith("/ai/generate-image-stream")) {
            const count =
              body?.novelai?.body?.parameters?.n_samples ??
              body?.novelai?.parameters?.n_samples ??
              body?.parameters?.n_samples ??
              body?.n ??
              1;
            const expected =
              Number.isInteger(count) && count >= 1 && count <= 8 ? count : 1;
            imageBytes = finalStreamImages(raw, entry.rawUrl, expected);
          } else {
            for (const block of raw.split(/\r?\n\r?\n/)) {
              const event = parseSSEBlock(block);
              if (
                event &&
                (event.data?.event_type === "error" || event.event === "error")
              ) {
                const message =
                  typeof event.data?.error === "string"
                    ? event.data.error
                    : event.data?.message || "原生流返回错误。";
                throw new RequestError(502, "novelai_stream_error", message, {
                  billingUnknown: true,
                  rawUrl: entry.rawUrl,
                });
              }
            }
          }
        }
      } else
        entry.rawUrl = persist ? await save(`${id}.bin`, bytes) : undefined;
      if (
        imageBytes.reduce((n, value) => n + value.length, 0) >
          MAX_IMAGE_TOTAL ||
        imageBytes.length > 32
      )
        throw new RequestError(
          502,
          "images_too_large",
          "解码后的图片超过本地结果上限。",
          { billingUnknown: true },
        );
      report({phase:'saving'});
      for (const [index, image] of imageBytes.entries()) {
        entry.images.push(await persistImage(image, entry, index, body, key));
      }
      entry.durationMs = Date.now() - started;
      report({phase:'complete'});
      if(persist)duplicateGuard.remember(body,endpoint,imageBytes,entry);
      if (persist) await saveHistory(entry);
      if(persist && body && body.novelai?.endpoint !== '/ai/generate-image/suggest-tags')await features.anlas.record(entry,body).catch(()=>{});
      emit({ type: "result", result: entry });
      if (stream) res.end();
      return entry;
    } catch (cause) {
      const networkCode=cause?.cause?.code||cause?.code;
      const connectFailed=!entry.upstreamStatus&&networkCode==='UND_ERR_CONNECT_TIMEOUT';
      const error =
        cause instanceof RequestError
          ? cause
          : new RequestError(
              timedOut ? 504 : 502,
              timedOut
                ? "gateway_timeout"
                : signal?.aborted
                  ? "request_cancelled"
                : abortedByClient
                  ? "request_aborted"
                  : "gateway_connection_error",
              !chargeable
                ? (timedOut?'网关连接检查超时，未提交生图。':'无法完成网关连接检查，未提交生图。')
                : timedOut
                ? "请求已超时；生成与计费状态未知，请先检查历史或账户，不要直接重试。"
                : signal?.aborted
                  ? "已停止本地接收；上游可能仍在生成，计费状态未知。"
                : abortedByClient
                  ? "客户端已中断；上游可能仍在生成，计费状态未知。"
                  : cause?.cause?.code==='ECONNRESET'||cause?.code==='ECONNRESET'
                  ? "与网关的连接被中途重置（ECONNRESET）；生成与计费状态未知，请核对请求记录。"
                  : "无法完成网关请求；生成与计费状态未知，请检查连接后再决定。",
              { billingUnknown: contacted&&chargeable },
            );
      error.message = redact(error.message, key);
      if(connectFailed){error.code='gateway_connect_timeout';error.status=504;error.billingUnknown=false;error.message=chargeable?`未能在 ${GATEWAY_CONNECT_TIMEOUT_MS/1000} 秒内建立连接；本次请求未发出，没有自动重试。`:'连接未建立；本次只读查询未完成。';}
      if(!chargeable)error.billingUnknown=false;
      error.requestId ||= entry.requestId;
      error.aggregationRequestId ||= entry.aggregationRequestId;
      error.upstreamStatus ??= entry.upstreamStatus;
      error.diagnostics={...transport,elapsedMs:Date.now()-started,...(typeof networkCode==='string'&&/^[A-Z0-9_]{1,50}$/.test(networkCode)?{networkCode}:{}),...(connectFailed?{requestSent:false,connectTimeoutMs:GATEWAY_CONNECT_TIMEOUT_MS}:{}),abortedByClient,cancelled:!!signal?.aborted,timedOut};
      entry.diagnostics=error.diagnostics;
      const detail = {
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: error.requestId,
        aggregationRequestId:error.aggregationRequestId,
        upstreamStatus: error.upstreamStatus,
        billingUnknown: Boolean(error.billingUnknown),
        retryAfter: error.retryAfter,
        rawUrl: error.rawUrl,
        diagnostics:error.diagnostics,
      };
      if (persist) {
        entry.status = "error";
        entry.error = detail;
        entry.durationMs = Date.now() - started;
        await saveHistory(entry).catch(() => {});
        if(body && body.novelai?.endpoint !== '/ai/generate-image/suggest-tags')await features.anlas.record(entry,body).catch(()=>{});
      }
      if (stream) {
        emit({ type: "error", error: detail });
        res.end();
        return null;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      res?.off("close", onClose);
      signal?.removeEventListener('abort',externalAbort);
    }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 8790;
    const validHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!validHosts.has(String(req.headers.host || "").toLowerCase())) {
      json(res, 403, {
        error: { code: "invalid_host", message: "只允许本机访问。" },
      });
      return;
    }
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
    if (origin && !allowedOrigins.has(origin)) {
      json(res, 403, {
        error: { code: "invalid_origin", message: "拒绝跨站点请求。" },
      });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      });
      res.end();
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      json(res, 403, {
        error: { code: "cross_site", message: "拒绝跨站点请求。" },
      });
      return;
    }
    const mutation=!['GET','HEAD','OPTIONS'].includes(req.method);
    if(mutation)inflightMutations++;
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      await materialsReady;
      const publicSettings=await refreshStorage();
      if(shuttingDown&&mutation)throw new RequestError(503,'shutting_down','服务正在退出，请重新启动后再操作。');
      if(storageChanging&&mutation)throw new RequestError(409,'storage_busy','保存目录正在更新，请稍后操作。');
      if(url.pathname==='/api/settings'&&req.method==='GET'){json(res,200,publicSettings);
      }else if(url.pathname==='/api/settings'&&req.method==='POST'){
        const change=await readJson(req,32768);if(change.autoSaveOutput!==undefined&&typeof change.autoSaveOutput!=='boolean')throw new RequestError(400,'invalid_storage_settings','自动保存设置必须为开关值。');if((generationBusy||['queued','running','stopping'].includes(generationJobs.active?.status)||features.comparisons.active)&&Object.keys(change).some(k=>!['beginner','tutorialComplete'].includes(k)))throw new RequestError(409,'generation_busy','任务执行期间不能更换连接或目录。');
        const changing=['outputDirectory','saveDirectory','autoSaveOutput'].some(key=>change[key]!==undefined&&change[key]!==publicSettings[key]);
        if(changing&&(storageChanging||inflightMutations>1||saveLocks.size))throw new RequestError(409,'storage_busy','还有操作未完成，请稍后更换目录。');
        if(changing)storageChanging=true;
        try{const saved=await configuration.update(change);if(changing)await refreshStorage();json(res,200,saved);}finally{if(changing)storageChanging=false;}
      }else if(['/api/settings/directory','/api/storage/directory','/api/storage/open'].includes(url.pathname)&&req.method==='POST'){
        if(![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)||req.headers['x-fx-action']!=='local-files')throw new RequestError(403,'desktop_forbidden','请从本机工作台打开目录。');
        const body=await readJson(req,8192),controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
        try{
          if(url.pathname.endsWith('/directory')){
            if(!['outputDirectory','saveDirectory'].includes(body.kind))throw new RequestError(400,'invalid_directory','目录类型无效。');
            json(res,200,await desktopFiles.choose(body.initialPath||publicSettings[body.kind],controller.signal));
          }else if(['output','saved'].includes(body.kind))json(res,200,await desktopFiles.open(body.kind==='output'?outputDir:saveDir,controller.signal));
          else if(body.kind==='image'){
            const entry=await historyEntry(body.id);if(!Number.isInteger(body.index)||body.index<0||!entry.images[body.index])throw new RequestError(400,'invalid_result','图片索引无效。');
            json(res,200,await desktopFiles.reveal(await resultFile(entry.images[body.index].name),controller.signal));
          }else throw new RequestError(400,'invalid_directory','目录类型无效。');
        }finally{res.off('close',closed);}
      }else if(url.pathname==='/api/connection/check'&&req.method==='POST'){
        const route=publicSettings.provider==='openai'?'/v1/models':'/user/subscription';
        const result=await callGateway(route,{method:'GET',persist:false,requestTimeoutMs:10000});
        if(publicSettings.provider==='official')await features.anlas.update({action:'pricingPolicy',value:result.json?.active&&result.json?.tier>=3&&!result.json?.usage?.isNegative?'opus':'paid'});
        json(res,200,{ok:true,message:'只读连接检查通过；未提交生图。',kind:publicSettings.provider==='openai'?'model-list':'subscription',subscription:publicSettings.provider==='official'?{active:result.json?.active,tier:result.json?.tier,usage:result.json?.usage}:null});
      }else if(url.pathname==='/api/opus'&&req.method==='GET'){
        let account=null,error=null;
        if(publicSettings.provider==='official'&&publicSettings.keyConfigured)try{const result=await callGateway('/user/subscription',{method:'GET',persist:false,requestTimeoutMs:10000});account={active:result.json?.active,tier:result.json?.tier,usage:result.json?.usage,trainingStepsLeft:result.json?.trainingStepsLeft,checkedAt:new Date().toISOString()};}catch(e){error=e.message;}
        const entries=await features.anlas.usageEntries();json(res,200,{account,error,liveAvailable:!!account,summary:summarizeUsage(entries,{timeZone:url.searchParams.get('timeZone')||'UTC',usage:account?.usage})});
      }else if(url.pathname==='/api/backup'&&req.method==='GET'){
        const library=await features.library.export();library.entries=library.entries.filter(e=>e.kind!=='draft');json(res,200,{format:'lucifer-fx-share-backup',version:1,settings:await configuration.export(),library,generatedLibrary:await generatedLibrary.exportAnnotations(),createdAt:new Date().toISOString()});
      }else if(['/api/backup','/api/backup/preview'].includes(url.pathname)&&req.method==='POST'){
        const input=await readJson(req,64*1024*1024),body=input.backup,mode=input.mode;
        if(body?.format!=='lucifer-fx-share-backup'||body.version!==1)throw new RequestError(400,'invalid_backup','不是兼容的分享版备份');
        if(!['merge','restore','preferences'].includes(mode))throw new RequestError(400,'invalid_mode','请选择合并、恢复或仅恢复界面偏好。');
        if(mode==='restore'&&body.settings)normalizeProfile(body.settings);
        if(url.pathname==='/api/backup/preview'){
          const summary=mode==='preferences'?{total:0,added:0,skipped:0,conflicts:0,categories:0}:await features.library.previewBackup(body.library,mode);
          json(res,200,{mode,...summary,connectionWillChange:mode==='restore'&&!!body.settings,preferencesAvailable:['lucifer-fx-appearance-v1','lucifer-panel-layout-v1','lucifer-tag-suggestions-v1','lucifer-zh-glossary-v1','lucifer-history-collapsed-v1'].filter(key=>typeof body.preferences?.[key]==='string').length});
        }else{
          if(mode!=='preferences'&&(generationBusy||['queued','running','stopping'].includes(generationJobs.active?.status)||features.comparisons.active))throw new RequestError(409,'generation_busy','请等待任务结束后再导入备份。');
          const summary=mode==='preferences'?{total:0,added:0,skipped:0,conflicts:0,categories:0}:await features.library.restoreBackup(body.library,mode);
          if(mode!=='preferences'&&body.generatedLibrary)await generatedLibrary.importAnnotations(body.generatedLibrary);
          if(mode==='restore'&&body.settings)await configuration.update({provider:body.settings.provider,baseURL:body.settings.baseURL,beginner:body.settings.beginner});
          json(res,200,{mode,...summary,message:mode==='preferences'?'仅恢复界面偏好；资料库和连接未改变。':mode==='merge'?'资料已合并；本地条目和连接未覆盖。':'资料及连接类型已恢复；冲突的本地条目保留。密钥和保存目录未导入。'});
        }
      }else if(url.pathname==='/api/reference/encode'&&req.method==='POST'){
        try{json(res,200,await referenceEncoding.encode(await readJson(req,maxInput)));}catch(e){throw new RequestError(e.status||400,e.code||'reference_encoding',e.message,{billingUnknown:!!e.billingUnknown});}
      }else if(url.pathname==='/api/generated-library'&&req.method==='GET'){
        try{json(res,200,await generatedLibrary.search(Object.fromEntries(url.searchParams)));}catch(e){throw new RequestError(400,'library_query',e.message);}
      }else if(url.pathname==='/api/generated-library/groups'&&req.method==='GET'){
        json(res,200,await generatedLibrary.groups(Object.fromEntries(url.searchParams)));
      }else if(url.pathname==='/api/generated-library/select'&&req.method==='POST'){
        const rows=await generatedLibrary.selection(await readJson(req,32768));if(rows.length>10000)throw new RequestError(400,'selection_limit','单次最多选择 10000 张，请缩小分类。');json(res,200,{items:rows});
      }else if(url.pathname==='/api/generated-library/cleanup/settings'&&['GET','POST'].includes(req.method)){
        if(libraryCleanup.busy)throw new RequestError(409,'generation_busy','图库正在清理。');json(res,200,await libraryCleanup.settings(req.method==='POST'?await readJson(req,1024):undefined));
      }else if(url.pathname==='/api/generated-library/cleanup/preview'&&req.method==='POST'){
        const body=await readJson(req,524288);json(res,200,await libraryCleanup.preview(body.keys));
      }else if(url.pathname==='/api/generated-library/cleanup/execute'&&req.method==='POST'){
        const body=await readJson(req,1024);json(res,200,await libraryCleanup.execute(body.token));
      }else if(url.pathname==='/api/generated-library/cleanup/trash'&&req.method==='GET'){
        json(res,200,await libraryCleanup.trash());
      }else if(url.pathname==='/api/generated-library/cleanup/restore'&&req.method==='POST'){
        const body=await readJson(req,1024);json(res,200,await libraryCleanup.restore(body.id));
      }else if(url.pathname==='/api/generated-library/cleanup/purge'&&req.method==='POST'){
        const body=await readJson(req,1024);if(body.confirm!==true)throw new RequestError(400,'confirmation_required','请确认永久清空回收站。');json(res,200,await libraryCleanup.purge());
      }else if(url.pathname==='/api/generated-library/status'&&req.method==='GET'){
        json(res,200,await generatedLibrary.status());
      }else if(url.pathname==='/api/generated-library/item'&&req.method==='GET'){
        try{json(res,200,await generatedLibrary.get(url.searchParams.get('id'),Number(url.searchParams.get('index'))));}catch(e){throw new RequestError(400,'library_item',e.message);}
      }else if(url.pathname==='/api/generated-library/annotation'&&req.method==='PATCH'){
        const {id,index,...patch}=await readJson(req,32768);try{json(res,200,await generatedLibrary.annotate(id,index,patch));}catch(e){throw new RequestError(400,'library_annotation',e.message);}
      }else if(url.pathname==='/api/generated-library/annotations'&&req.method==='GET'){
        json(res,200,await generatedLibrary.exportAnnotations());
      }else if(url.pathname==='/api/generated-library/annotations'&&req.method==='POST'){
        try{json(res,200,await generatedLibrary.importAnnotations(await readJson(req,16*1024*1024)));}catch(e){throw new RequestError(400,'library_annotations',e.message);}
      }else if(['/api/generated-library/pause','/api/generated-library/resume'].includes(url.pathname)&&req.method==='POST'){
        await readJson(req,1024);if(url.pathname.endsWith('/pause'))generatedLibrary.pause();else generatedLibrary.resume();json(res,200,await generatedLibrary.status());
      }else if(url.pathname==='/api/generated-library/rebuild'&&req.method==='POST'){
        await readJson(req,1024);void generatedLibrary.rebuild().catch(()=>{});json(res,202,{started:true});
      }else if(url.pathname==='/api/shutdown'&&req.method==='POST'){
        const installId=options.installId??process.env.FX_SHARE_INSTALL_ID;
        if(!installId||req.headers.origin!==`http://127.0.0.1:${port}`&&req.headers.origin!==`http://localhost:${port}`||req.headers['x-fx-action']!=='shutdown'||req.headers['x-fx-install-id']!==installId)throw new RequestError(403,'shutdown_forbidden','只能从当前安装的本地工作台退出服务。');
        await readJson(req,1024);
        await updater.info();
        if(inflightMutations>1||updater.active||generationBusy||['queued','running','stopping'].includes(generationJobs.active?.status)||features.comparisons.active)throw new RequestError(409,'generation_busy','仍有请求、生成、下载更新或对照任务；请等待完成或先停止任务。');
        shuttingDown=true;
        json(res,200,{stopping:true,message:'本安装的服务正在退出。现在可关闭页面。'});
        res.once('finish',()=>setImmediate(()=>server.close()));
      }else if(url.pathname==='/api/share-image'&&req.method==='GET'){
        const entry=await historyEntry(url.searchParams.get('id')),image=entry.images[Number(url.searchParams.get('index'))];if(!image)throw new RequestError(404,'not_found','图片不存在');const file=await imageSource(image);if(!file)throw new RequestError(404,'not_found','源文件不可用');const bytes=await readFile(file),out=url.searchParams.get('metadata')==='keep'?bytes:stripImageMetadata(bytes);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'image/png','Content-Disposition':'attachment; filename="Lucifer-FX-share'+path.extname(file)+'"','Content-Length':out.length});res.end(out);
      }else if(url.pathname==='/api/release-info'&&req.method==='GET'){
        json(res,200,releaseServices.releaseInfo());
      }else if(url.pathname==='/api/check-updates'&&req.method==='POST'){
        const body=await readJson(req,1024);
        json(res,200,await checkRelease(body.automatic===true));
      }else if(url.pathname==='/api/update-state'&&req.method==='GET'){
        json(res,200,await updater.info());
      }else if(['/api/update/prepare','/api/update/cancel','/api/update/install'].includes(url.pathname)&&req.method==='POST'){
        const installId=options.installId??process.env.FX_SHARE_INSTALL_ID;
        if(!installId||![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)||req.headers['x-fx-action']!=='update'||req.headers['x-fx-install-id']!==installId)throw new RequestError(403,'update_forbidden','只能从当前安装的本地工作台更新。');
        await readJson(req,1024);
        if(url.pathname.endsWith('/prepare'))json(res,202,await updater.prepare());
        else if(url.pathname.endsWith('/cancel'))json(res,200,await updater.cancel());
        else{
          if(inflightMutations>1||generationBusy||['queued','running','stopping'].includes(generationJobs.active?.status)||features.comparisons.active)throw new RequestError(409,'generation_busy','请等待生成、对照和其他操作完成后再安装。');
          assertUpdateStorage(runtimeRoot,[outputDir,saveDir,...storageRoots]);
          shuttingDown=true;
          try{const state=await updater.install({port});json(res,202,state);res.once('finish',()=>setImmediate(()=>server.close()));}catch(e){shuttingDown=false;throw e;}
        }
      }else if (url.pathname === "/api/status" && req.method === "GET") {
        const keyConfigured = publicSettings.keyConfigured;
        json(res, 200, {
          keyConfigured,
          app: 'Lucifer NovelAI FX',
          version: RELEASE_CONFIG.version+'-share',
          installId: options.installId??process.env.FX_SHARE_INSTALL_ID??null,
          processId:process.pid,
          desktopBusy:generationBusy||!!features.comparisons.active||inflightMutations>0,
          generationBusy,
          activeComparison: features.comparisons.active,
          generationJobs:true,
          gatewayTransport:!options.fetchImpl?{protocol:'http/1.1',requestDeadlineMs:timeoutMs,connectTimeoutMs:GATEWAY_CONNECT_TIMEOUT_MS,headersTimeoutMs:0,bodyTimeoutMs:0,automaticRetry:false}:{protocol:'injected'},
          opusBatch:true,
          remoteTagsEnabled:false,
          activeGeneration:generationJobs.active?{id:generationJobs.active.id,status:generationJobs.active.status}:null,
          gateway: publicSettings.baseURL,
          shareEdition:true,
          beginner:publicSettings.beginner,
          tutorialComplete:publicSettings.tutorialComplete,
          platform:"windows",
          autoSaveOutput,
          outputDirectory: outputDir,
          saveDirectory: saveDir,
          maxRequestBytes: maxInput,
          nativeRoutesNote:
            "聚合入口可能仅开放 OpenAI 路径；原生路径需独立验证。",
        });
      } else if(url.pathname==='/api/agent/setup'&&req.method==='GET'){
        json(res,200,agentSetup({project:PROJECT,port}));
      } else if(url.pathname==='/api/atlas/storage'){
        if(req.method==='GET')json(res,200,{items:await atlasStorage.read()});
        else if(req.method==='POST')json(res,200,await atlasStorage.update(await readJson(req,9*1024*1024)));
        else throw new RequestError(405,'method_not_allowed','不支持此方法。');
      } else if(url.pathname==='/api/atlas/resource'&&req.method==='GET'){
        try{const bytes=await atlasResource(url.searchParams.get('url'),{fetchImpl});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(bytes);}catch(e){throw new RequestError(502,'atlas_resource_error',e.message);}
      } else if(url.pathname==='/api/atlas/frame'&&req.method==='GET'){
        try{const [{html},items]=await Promise.all([atlasDocumentSource(fetchImpl),atlasStorage.read()]);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads; frame-ancestors 'self'"});res.end(atlasDocument(html,items));}
        catch(e){res.writeHead(502,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});res.end('<p>法典图鉴暂时无法读取，请点击右上角刷新或在原站打开。</p>');}
      } else if(url.pathname==='/api/atlas/original'&&req.method==='GET'){
        const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
        try{const image=await atlasOriginal(url.searchParams.get('url'),{fetchImpl,signal:controller.signal});if(!res.destroyed){res.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});res.end(image.bytes);}}
        catch(e){throw new RequestError(502,'atlas_import_error',e.message);}finally{res.off('close',closed);}
      } else if (url.pathname==='/api/generation-jobs'&&req.method==='POST') {
        const body=await readJson(req,maxInput);try{json(res,202,await generationJobs.start(body));}catch(e){throw new RequestError(e.status||400,e.code||'generation_job_error',e.message);}
      } else if (/^\/api\/generation-jobs\/[a-f0-9-]{36}(?:\/stop)?$/.test(url.pathname)) {
        try{const id=url.pathname.split('/')[3];if(req.method==='GET'&&!url.pathname.endsWith('/stop'))json(res,200,await generationJobs.get(id));else if(req.method==='POST'&&url.pathname.endsWith('/stop')){const body=await readJson(req,1024);json(res,200,await generationJobs.stop(id,{cancelCurrent:body.cancelCurrent??false}));}else throw new RequestError(405,'method_not_allowed','不支持此方法。');}catch(e){throw new RequestError(e.status||400,e.code||'generation_job_error',e.message);}
      } else if(url.pathname==='/api/danbooru/image'&&req.method==='GET'){
        const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
        try{const image=await features.danbooruImage(url.searchParams.get('url'),controller.signal);if(!res.destroyed){res.writeHead(200,{'Content-Type':image.contentType,'Content-Length':image.bytes.length,'Cache-Control':'private, max-age=120','Content-Security-Policy':"default-src 'none'"});res.end(image.bytes);}}
        catch(e){throw new RequestError(e.status||502,e.code||'danbooru_image_error',e.message);}
        finally{res.off('close',closed);}
      } else if (/^\/api\/(?:library|comparisons|anlas|artists|danbooru)(?:\/|$)/.test(url.pathname)) {
        const body=['POST','PUT'].includes(req.method)?await readJson(req,128*1024*1024):undefined;
        if(url.pathname==='/api/comparisons'&&req.method==='POST'&&(generationBusy||generationJobs.active))throw new RequestError(409,'generation_busy','当前图片生成尚未完成。');
        try{json(res,200,await features.handle(url,req.method,body));}catch(e){throw new RequestError(e.status||400,e.code||'feature_error',e.message);}
      } else if (url.pathname === "/api/save-result" && req.method === "POST") {
        const body = await readJson(req, 4096);
        json(res, 200, await saveResult(body.id, body.index));
      } else if (url.pathname === "/api/models" && req.method === "GET") {
        if(publicSettings.provider!=="openai"||!publicSettings.keyConfigured){json(res,200,{data:MODEL_IDS.map(id=>({id})),source:"bundled-schema"});return;}
        const result = await callGateway("/v1/models", {
          method: "GET",
          req,
          res,
          persist: false,
          requestTimeoutMs: Math.min(timeoutMs,10000),
        });
        const value = result.json;
        if (!Array.isArray(value?.data))
          throw new RequestError(
            502,
            "invalid_models",
            "网关模型列表格式不正确。",
          );
        json(res, 200, {
          ...value,
          data: value.data.filter(
            (model) =>
              typeof model.id === "string" &&
              /(?:^nai-|novelai)/i.test(model.id),
          ),
        });
      } else if (url.pathname === "/api/history" && req.method === "GET") {
        await ready;
        const limitValue=url.searchParams.get('limit')??'200',limit=Number(limitValue),before=url.searchParams.get('before');
        if(!Number.isInteger(limit)||limit<1||limit>200)throw new RequestError(400,'invalid_limit','每页历史记录须为 1–200 条。');
        if(before&&!/^[\d]+-[a-f0-9-]+$/.test(before))throw new RequestError(400,'invalid_cursor','历史游标无效。');
        const names = (await readdir(historyDir))
          .filter((name) => /^[\d]+-[a-f0-9-]+\.json$/.test(name))
          .sort()
          .reverse().filter(name=>!before||name<`${before}.json`);
        const found=[];
        for(const name of names){
          try{const entry=JSON.parse(await readFile(path.join(historyDir,name),'utf8'));if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&entry.id===name.slice(0,-5)&&!(entry.images?.length&&entry.images.every(image=>image.deletedAt)))found.push({name,entry});}catch{}
          if(found.length>limit)break;
        }
        const page=found.slice(0,limit);
        json(res, 200, { entries:page.map(item=>item.entry),nextCursor:found.length>limit?page.at(-1).name.slice(0,-5):null });
      } else if (
        url.pathname.startsWith("/api/results/") &&
        ["GET", "HEAD"].includes(req.method)
      ) {
        const name = decodeURIComponent(
          url.pathname.slice("/api/results/".length),
        );
        if (
          !/^[\d]+-[a-f0-9-]+(?:-(?:request|response|[\d]+))?\.(?:json|png|jpg|webp|gif|zip|bin|sse|txt)$/.test(
            name,
          )
        )
          throw new RequestError(404, "not_found", "文件不存在。");
        const bytes = await readFile(await resultFile(name));
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(name)] || "application/octet-stream",
          "Content-Length": bytes.length,
          "Cache-Control": "private, max-age=3600",
          ...(url.searchParams.get("download") === "1"
            ? { "Content-Disposition": `attachment; filename="${name}"` }
            : {}),
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
      } else if (
        req.method === "POST" &&
        ["/api/request", "/api/tags", "/api/native"].includes(url.pathname)
      ) {
        const body = await readJson(req, maxInput);
        if (url.pathname === "/api/tags") {
          if (typeof body.model !== "string" || body.model.length > 100 || typeof body.prompt !== "string" || body.prompt.trim().length < 2 || body.prompt.length > 100 || /[\r\n]/.test(body.prompt))
            throw new RequestError(
              400,
              "invalid_tags",
              "标签查询需要 model 和 2–100 字符的单个词条。",
            );
          json(res, 200, {tags:[],disabled:true,code:'remote_tags_disabled',message:'远程关联词已暂停：当前网关会按图片计费。请使用本地 Danbooru 词库。'});
        } else if (url.pathname === "/api/request") {
          if(generationJobs.active)throw new RequestError(409,'generation_busy','服务端已有生成任务，不能重复提交。');
          if (
            !body.payload ||
            typeof body.payload !== "object" ||
            Array.isArray(body.payload)
          )
            throw new RequestError(
              400,
              "invalid_payload",
              "payload 需要完整的图像请求 JSON 对象。",
            );
          const stream = url.searchParams.get("stream") === "1";
          if(features.comparisons.active)throw new RequestError(409,'comparison_busy','A/B/C 对照仍在执行，请停止后续任务或等待完成。');
          const result = await generationLease(()=>callGateway("/v1/images/generations", {
            body: body.payload,
            preventDuplicate: body.preventDuplicate===true,
            req,
            res,
            stream,
          }));
          if (!stream) json(res, 200, result);
        } else {
          if (!nativeRouteAllowed(body.route))
            throw new RequestError(
              400,
              "invalid_route",
              "此原生路径不在网关源代码允许范围内。",
            );
          const method = String(body.method || "POST").toUpperCase();
          if (
            !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)
          )
            throw new RequestError(
              400,
              "invalid_method",
              "不支持此 HTTP 方法。",
            );
          if (
            body.query !== undefined &&
            (!body.query ||
              typeof body.query !== "object" ||
              Array.isArray(body.query))
          )
            throw new RequestError(
              400,
              "invalid_query",
              "query 需要 JSON 对象。",
            );
          const stream = url.searchParams.get("stream") === "1";
          if(generationJobs.active||features.comparisons.active)throw new RequestError(409,'generation_busy','已有生成或对照任务，原生 API 需等待任务结束，不能并发提交。');
          const result = await generationLease(()=>callGateway(body.route, {
            method,
            body: ["GET", "HEAD"].includes(method) ? undefined : body.body,
            query: body.query,
            req,
            res,
            stream,
          }));
          if (!stream) json(res, 200, result);
        }
      } else if (url.pathname.startsWith("/api/"))
        throw new RequestError(404, "not_found", "接口不存在。");
      else if (["GET", "HEAD"].includes(req.method)) {
        const requested = decodeURIComponent(url.pathname);
        const target = path.resolve(distDir, `.${requested}`);
        if (
          target !== path.resolve(distDir) &&
          !target.startsWith(`${path.resolve(distDir)}${path.sep}`)
        )
          throw new RequestError(403, "invalid_path", "无效路径。");
        let file = target;
        try {
          if (!(await stat(file)).isFile())
            file = path.join(distDir, "index.html");
        } catch {
          file = path.join(distDir, "index.html");
        }
        const bytes = await readFile(file);
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(file)] || "application/octet-stream",
          "Content-Length": bytes.length,
          "Cache-Control": "no-cache",
          "Content-Security-Policy":
            "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-src 'self' https://novelai.quicktagcloud.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
      } else
        throw new RequestError(405, "method_not_allowed", "不支持此方法。");
    } catch (error) {
      const status =
        (error instanceof RequestError||error instanceof FeatureError)
          ? error.status
          : error.code === "ENOENT"
            ? 404
            : 500;
      json(res, status, {
        error: {
          message:
            (error instanceof RequestError||error instanceof FeatureError)
              ? error.message
              : status === 404
                ? "文件不存在；前端请先运行 npm run build。"
                : "本地服务处理失败。",
          code:
            (error instanceof RequestError||error instanceof FeatureError)
              ? error.code
              : status === 404
                ? "not_found"
                : "local_error",
          status,
          requestId: error.requestId,
          billingUnknown: Boolean(error.billingUnknown),
          upstreamStatus: error.upstreamStatus,
          retryAfter: error.retryAfter,
          rawUrl: error.rawUrl,
        },
      });
    } finally {if(mutation)inflightMutations--;}
  });
  server.requestTimeout = 300_000;
  server.once('listening',()=>{void generatedLibrary.start().catch(()=>{});if(options.residentHost!==false)void startResidentHost({root:runtimeRoot,port:server.address().port,installId:options.installId??process.env.FX_SHARE_INSTALL_ID}).catch(()=>{console.warn('Resident launcher unavailable; the local web service remains available.');});});
  const closeServer=server.close.bind(server);
  server.close=callback=>{clearInterval(cleanupTimer);closeServer(async error=>{await libraryCleanup.close();await generatedLibrary.close().catch(()=>{});callback?.(error);});return server;};
  server.headersTimeout = 15_000;
  server.once('close',()=>{for(const transport of transports.values())void transport.close().catch(()=>{});});
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createStudioServer();
  const portAt=process.argv.indexOf('--port');const port=portAt>=0?Number(process.argv[portAt+1]):8796;
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');
  server.listen(port, "127.0.0.1", () =>
    console.log(`Lucifer NovelAI FX: http://127.0.0.1:${port}`),
  );
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use.`
        : "Local server failed to start.",
    );
    process.exitCode = 1;
  });
  server.on('close',()=>{setTimeout(()=>process.exit(0),250).unref();});
}

export { nativeRouteAllowed };
