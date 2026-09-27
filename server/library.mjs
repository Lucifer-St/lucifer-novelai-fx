import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, createLocalStore, FeatureError } from './local-store.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DEFAULT_BUNDLE = fileURLToPath(new URL('../public/curated/library.json', import.meta.url));
const MIGRATION_MARKER = 'curated-v2.json';

// v1 assigned random IDs while importing. These hashes cover every seed-owned
// field, including the complete cover and preset payload. They intentionally
// exclude storage metadata such as timestamps and revision numbers.
export const LEGACY_V1_FINGERPRINTS = Object.freeze([
  'ea6abcc305783538e9faffa458537a1a515ae7bab3b2998f3a3ed53a9e4a5c16',
  '6fe775b20fac70d571b2704976a09fdada0b8b0514e1740e8fc8e29080496bdc',
  'fd72f7ec80d2c96edcffc76a45dd742d76ac5f19dbaeeb2fa4825daa52564d02',
  '263463703d305e7603c95bf9633f39ec638de7bd32347a6709dadb8508e38eb7',
  '756a73f2a0d6c2b946fe3070fe3127a92658fc7a67ed4e55ef291fa27c144eb1',
  '525622239a243daefbca11098fe67e4a4880f2adf970210b9b5d2ce86252028b',
  '2e6ce3d904c3b730b645b9d303e92d8cd23484bf7982a2b0f6df3733ed93997f',
  'cc0d4709344b51a4608b199f10a3e945c12f5c2a40d3539de4464aefd0f59a1a',
]);

// Stable IDs are the provenance boundary for v2 and later. A record with one
// of these IDs is never changed or removed unless its complete fingerprint is
// also an exact match for the corresponding official seed.
export const CURATED_SEED_IDS = Object.freeze({
  Rena: '065cf6d0-0937-4bed-85bf-e1c2b51d0d5b',
  Teresa: '018af513-4f1b-4899-b4ba-b0aa10090e1e',
  Noire: '5ed2abee-d225-4a2d-9bf2-f69f8988eee8',
  smile: '3e3ba6dc-37c2-482f-adc9-7df76d176f89',
  Claire: 'bb4dec5d-e116-4a7c-bd0a-734d529b50df',
  negative: '6af1c16e-b30b-469c-9a79-d4f329622fd6',
  Antonia: '1007d358-745a-44bf-9a5e-b07e6265127e',
  colorful: '838e8639-aea4-4ba3-8a70-c70bf7daedec',
});

const RETIRED_STABLE_SEEDS = Object.freeze(new Map([
  [CURATED_SEED_IDS.Teresa, LEGACY_V1_FINGERPRINTS[1]],
  [CURATED_SEED_IDS.smile, LEGACY_V1_FINGERPRINTS[3]],
  [CURATED_SEED_IDS.negative, LEGACY_V1_FINGERPRINTS[5]],
  [CURATED_SEED_IDS.Antonia, LEGACY_V1_FINGERPRINTS[6]],
  [CURATED_SEED_IDS.colorful, LEGACY_V1_FINGERPRINTS[7]],
]));
const CURRENT_SEED_TITLES = new Map([
  [CURATED_SEED_IDS.Rena, 'Rena'],
  [CURATED_SEED_IDS.Noire, 'Noire'],
  [CURATED_SEED_IDS.Claire, 'Claire'],
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function seedFields(entry) {
  return {
    kind: String(entry?.kind ?? ''),
    title: String(entry?.title ?? ''),
    category: String(entry?.category ?? ''),
    notes: String(entry?.notes ?? ''),
    text: String(entry?.text ?? ''),
    sourceUrl: String(entry?.sourceUrl ?? ''),
    cover: String(entry?.cover ?? ''),
    payload: entry?.payload ?? null,
  };
}

export function curatedFingerprint(entry) {
  return createHash('sha256').update(JSON.stringify(stableValue(seedFields(entry)))).digest('hex');
}

function untouched(record) {
  return record?.revision === 1 && record.createdAt === record.updatedAt && !record.deletedAt;
}

async function readRecords(directory) {
  let names;
  try { names = await readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const records = [];
  for (const name of names.filter(name => UUID.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))) {
    const file = path.join(directory, name);
    const record = JSON.parse(await readFile(file, 'utf8'));
    if (record.id !== name.slice(0, -5)) throw new FeatureError('预设库记录 ID 与文件名不一致；已停止精选迁移。', 'store_corrupt', 500);
    records.push({ file, record, fingerprint: curatedFingerprint(record) });
  }
  return records;
}

async function loadBundle(bundlePath) {
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  if (bundle?.format !== 'lucifer-library' || bundle.version !== 1 || !Array.isArray(bundle.entries))
    throw new FeatureError('无法识别随包精选库。', 'curated_bundle_invalid', 500);
  if (bundle.entries.length !== CURRENT_SEED_TITLES.size) throw new FeatureError('随包精选库必须且只能包含三张角色提示词卡。', 'curated_bundle_invalid', 500);
  const ids = new Set();
  for (const entry of bundle.entries) {
    if (entry.kind !== 'snippet' || !UUID.test(entry.id || '') || ids.has(entry.id) || CURRENT_SEED_TITLES.get(entry.id) !== entry.title)
      throw new FeatureError('随包精选卡缺少唯一稳定 ID。', 'curated_bundle_invalid', 500);
    ids.add(entry.id);
  }
  return bundle;
}

function exactLegacyCohort(records, legacyFingerprints, stableIds) {
  const matches = [];
  for (const fingerprint of legacyFingerprints) {
    const candidates = records.filter(item => item.fingerprint === fingerprint && untouched(item.record) && !stableIds.has(item.record.id));
    if (candidates.length !== 1) return null;
    matches.push(candidates[0]);
  }
  return new Set(matches).size === legacyFingerprints.length ? matches : null;
}

async function installMissingCurrent(library, records, entries, { rekeyLegacy = false } = {}) {
  let installed = 0;
  for (const entry of entries) {
    if (records.some(item => item.record.id === entry.id)) continue;
    // On an uncertain legacy installation, retain an identical random-ID card
    // without creating a duplicate. Only the complete v1 cohort is re-keyed.
    if (!rekeyLegacy && records.some(item => item.fingerprint === curatedFingerprint(entry) && untouched(item.record))) continue;
    await library.put(entry);
    installed++;
  }
  return installed;
}

async function removeIfStillExact(item, expectedFingerprint) {
  const latest = JSON.parse(await readFile(item.file, 'utf8'));
  if (!untouched(latest) || curatedFingerprint(latest) !== expectedFingerprint) return false;
  await unlink(item.file);
  return true;
}

/**
 * Install the three public prompt cards and conservatively retire old official
 * seeds. This function must run before the library API starts serving requests.
 */
export async function initializeCuratedLibrary({
  dataDir,
  bundlePath = DEFAULT_BUNDLE,
  legacyFingerprints = LEGACY_V1_FINGERPRINTS,
} = {}) {
  if (!dataDir) throw new TypeError('dataDir is required');
  const libraryDir = path.join(dataDir, 'library');
  const bootstrap = createLocalStore(path.join(dataDir, 'bootstrap'));
  const previousMarker = await bootstrap.read(MIGRATION_MARKER);
  if (previousMarker?.version === 2) return { ...previousMarker, alreadyApplied: true };

  const bundle = await loadBundle(bundlePath);
  await mkdir(libraryDir, { recursive: true });
  const library = createLibrary(libraryDir);
  const before = await readRecords(libraryDir);
  const v1Marker = await bootstrap.read('curated-v1.json');
  const stableIds = new Set(bundle.entries.map(entry => entry.id));
  const cohort = v1Marker?.installed === true && v1Marker.version === 1
    ? exactLegacyCohort(before, legacyFingerprints, stableIds)
    : null;

  // Install first so an interruption cannot leave a migrated user without the
  // supported cards. Existing stable IDs, including edited ones, are untouched.
  const installed = await installMissingCurrent(library, before, bundle.entries, { rekeyLegacy: Boolean(cohort) });
  let removed = 0;
  let status = before.length ? 'preserved_uncertain' : 'fresh_install';

  if (cohort) {
    for (const item of cohort) if (await removeIfStillExact(item, item.fingerprint)) removed++;
    status = 'migrated_legacy_v1';
  } else {
    // Stable-ID records from any intermediate v2 build are removable only when
    // both the ID and the complete historical content fingerprint match.
    for (const item of before) {
      const expected = RETIRED_STABLE_SEEDS.get(item.record.id);
      if (expected && item.fingerprint === expected && await removeIfStillExact(item, expected)) removed++;
    }
    if (before.length && removed) status = 'retired_stable_seeds';
  }

  const marker = {
    installed: true,
    version: 2,
    status,
    installedCount: installed,
    removedCount: removed,
  };
  await bootstrap.write(MIGRATION_MARKER, marker);
  return marker;
}
