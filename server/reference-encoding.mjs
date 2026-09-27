import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { FeatureError } from './local-store.mjs';

const MODELS = new Set(['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ENCODING_BYTES = 8 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

function base64Bytes(value, limit, label) {
  if (typeof value !== 'string') throw new FeatureError(`${label}必须是 Base64 字符串。`);
  const raw = value.replace(/^data:image\/(?:png|jpeg|webp);base64,/i, '');
  if (!raw || raw.length > Math.ceil(limit / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
    throw new FeatureError(`${label}格式无效或过大。`);
  }
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== raw) throw new FeatureError(`${label}格式无效或过大。`);
  return bytes;
}

function validateImage(bytes) {
  const png = bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    && bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  const jpeg = bytes.length >= 16 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
    && bytes.subarray(-2).equals(Buffer.from('ffd9', 'hex'));
  const webp = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!png && !jpeg && !webp) throw new FeatureError('参考图需为 PNG、JPEG 或 WebP。');
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new FeatureError('参考图编码记录无法读取；请保留文件并检查磁盘。', 'store_corrupt', 500);
  }
}

async function durableCreate(file, value) {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
}

async function atomicWrite(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await durableCreate(temp, value);
  await rename(temp, file);
}

function publicReceipt(record, replay = false) {
  if (record.status === 'completed') return { status: 'completed', encoding: record.encoding, cached: !!record.cached, requestId: record.requestId, replay };
  return { status: 'unknown', billingUnknown: true, requestId: record.requestId, replay };
}

/** One explicit user action may call encode once. Pending receipts are never resumed after a restart. */
export function createReferenceEncoding({ directory, encode }) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || typeof encode !== 'function') {
    throw new TypeError('createReferenceEncoding requires an absolute directory and an encode callback.');
  }
  const root = path.resolve(directory);
  const requestsDir = path.join(root, 'requests');
  const cacheDir = path.join(root, 'cache');
  const running = new Map();
  const tails = new Map();

  function validate({ model, image, information, requestId } = {}) {
    if (!MODELS.has(model)) throw new FeatureError('参考图编码仅支持 V4.5 Full/Curated。', 'unsupported_reference_model');
    if (typeof information !== 'number' || !Number.isFinite(information) || information < 0 || information > 1) {
      throw new FeatureError('信息提取必须在 0–1 之间。');
    }
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) throw new FeatureError('需要有效的编码请求 ID。');
    const bytes = base64Bytes(image, MAX_IMAGE_BYTES, '参考图');
    validateImage(bytes);
    const imageHash = createHash('sha256').update(bytes).digest('hex');
    const fingerprint = createHash('sha256').update(`${model}\n${imageHash}\n${information}`).digest('hex');
    return { model, image: bytes.toString('base64'), information, requestId, fingerprint };
  }

  async function status(requestId) {
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) throw new FeatureError('无效的编码请求 ID。');
    const record = await readJson(path.join(requestsDir, `${requestId}.json`));
    return record ? publicReceipt(record, true) : null;
  }

  async function run(input) {
    const { model, image, information, requestId, fingerprint } = input;
    await mkdir(requestsDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    const receiptFile = path.join(requestsDir, `${requestId}.json`);
    const cacheFile = path.join(cacheDir, `${fingerprint}.json`);
    const racedReceipt = async () => {
      const raced = await readJson(receiptFile);
      if (!raced || raced.fingerprint !== fingerprint) throw new FeatureError('同一编码请求 ID 不能用于不同参考图或参数。', 'idempotency_conflict', 409);
      return publicReceipt(raced, true);
    };
    const existing = await readJson(receiptFile);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new FeatureError('同一编码请求 ID 不能用于不同参考图或参数。', 'idempotency_conflict', 409);
      return publicReceipt(existing, true);
    }
    const cached = await readJson(cacheFile);
    if (cached) {
      const record = { version: 1, requestId, fingerprint, status: 'completed', cached: true, encoding: cached.encoding, createdAt: new Date().toISOString() };
      try { await durableCreate(receiptFile, record); }
      catch (error) { if (error.code === 'EEXIST') return racedReceipt(); throw error; }
      return publicReceipt(record);
    }
    const record = { version: 1, requestId, fingerprint, status: 'pending', createdAt: new Date().toISOString() };
    try { await durableCreate(receiptFile, record); }
    catch (error) { if (error.code === 'EEXIST') return racedReceipt(); throw error; }
    try {
      const encoding = await encode({ model, image, information_extracted: information, requestId });
      base64Bytes(encoding, MAX_ENCODING_BYTES, '编码结果');
      const now = new Date().toISOString();
      await atomicWrite(cacheFile, { version: 1, fingerprint, encoding, createdAt: now });
      const complete = { ...record, status: 'completed', cached: false, encoding, updatedAt: now };
      await atomicWrite(receiptFile, complete);
      return publicReceipt(complete);
    } catch (error) {
      const unknown = { ...record, status: 'unknown', billingUnknown: true, updatedAt: new Date().toISOString(), errorCode: error?.code || 'encoding_unconfirmed' };
      try { await atomicWrite(receiptFile, unknown); } catch { /* The durable pending receipt still blocks a retry. */ }
      return publicReceipt(unknown);
    }
  }

  function encodeOnce(args) {
    const input = validate(args); // All argument rejection happens before a paid callback.
    const active = running.get(input.requestId);
    if (active) {
      if (active.fingerprint !== input.fingerprint) throw new FeatureError('同一编码请求 ID 不能用于不同参考图或参数。', 'idempotency_conflict', 409);
      return active.promise;
    }
    const prior = tails.get(input.fingerprint) || Promise.resolve();
    const promise = prior.catch(() => {}).then(() => run(input));
    running.set(input.requestId, { fingerprint: input.fingerprint, promise });
    tails.set(input.fingerprint, promise);
    const release = () => {
      if (running.get(input.requestId)?.promise === promise) running.delete(input.requestId);
      if (tails.get(input.fingerprint) === promise) tails.delete(input.fingerprint);
    };
    promise.then(release, release);
    return promise;
  }

  return { encode: encodeOnce, status };
}
