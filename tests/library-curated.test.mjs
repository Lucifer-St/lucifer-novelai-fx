import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLibrary, createLocalStore } from '../server/local-store.mjs';
import {
  CURATED_SEED_IDS,
  curatedFingerprint,
  initializeCuratedLibrary,
} from '../server/library.mjs';

const currentEntries = [
  ['Rena', CURATED_SEED_IDS.Rena],
  ['Noire', CURATED_SEED_IDS.Noire],
  ['Claire', CURATED_SEED_IDS.Claire],
].map(([title, id]) => ({
  id, kind: 'snippet', title, category: '角色', notes: 'public fixture',
  text: `${title.toLowerCase()} prompt`, sourceUrl: '',
  cover: 'data:image/png;base64,AA==', payload: null,
}));

const legacyEntries = Array.from({ length: 8 }, (_, index) => ({
  kind: index === 3 ? 'preset' : index === 5 ? 'negative' : 'snippet',
  title: `legacy-${index}`,
  category: index % 2 ? '其他' : '角色',
  notes: 'legacy official fixture',
  text: `historical prompt ${index}`,
  sourceUrl: '',
  cover: `data:image/png;base64,${Buffer.from(`cover-${index}`).toString('base64')}`,
  payload: index === 3 ? { state: { prompt: 'full preset', seed: -1 } } : null,
}));
legacyEntries[0] = { ...currentEntries[0], id: undefined };
legacyEntries[2] = { ...currentEntries[1], id: undefined };
legacyEntries[4] = { ...currentEntries[2], id: undefined };
const legacyFingerprints = legacyEntries.map(curatedFingerprint);

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fx-curated-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  const bundlePath = path.join(root, 'library.json');
  await mkdir(dataDir, { recursive: true });
  await writeFile(bundlePath, JSON.stringify({
    format: 'lucifer-library', version: 1, categories: [], entries: currentEntries,
  }));
  return { root, dataDir, bundlePath, library: createLibrary(path.join(dataDir, 'library')) };
}

async function seedV1(f) {
  const imported = await f.library.import({
    format: 'lucifer-library', version: 1, categories: ['旧精选'], entries: legacyEntries,
  });
  await createLocalStore(path.join(f.dataDir, 'bootstrap')).write('curated-v1.json', { installed: true, version: 1 });
  return imported;
}

async function records(dataDir) {
  const directory = path.join(dataDir, 'library');
  let names = [];
  try { names = await readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return Promise.all(names.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
}

const migrate = f => initializeCuratedLibrary({
  dataDir: f.dataDir,
  bundlePath: f.bundlePath,
  legacyFingerprints,
});

test('fresh install contains only the three stable-ID public prompt cards', async t => {
  const f = await fixture(t);
  const result = await migrate(f), saved = await records(f.dataDir);
  assert.equal(result.status, 'fresh_install');
  assert.equal(result.installedCount, 3);
  assert.deepEqual(saved.map(entry => entry.id).sort(), currentEntries.map(entry => entry.id).sort());
  assert.deepEqual(saved.map(entry => entry.title).sort(), ['Claire', 'Noire', 'Rena']);
  assert.ok(saved.every(entry => entry.kind === 'snippet' && entry.revision === 1));
});

test('complete untouched v1 cohort is retired while user cards and presets survive', async t => {
  const f = await fixture(t), old = await seedV1(f);
  const userCard = await f.library.put({ kind: 'snippet', title: '用户角色', text: 'mine' });
  const userPreset = await f.library.put({ kind: 'preset', title: 'smile', text: 'user preset', payload: { state: { prompt: 'mine' } } });
  const result = await migrate(f), saved = await records(f.dataDir), ids = new Set(saved.map(entry => entry.id));
  assert.equal(result.status, 'migrated_legacy_v1');
  assert.equal(result.removedCount, 8);
  assert.ok(old.every(entry => !ids.has(entry.id)));
  assert.ok(ids.has(userCard.id) && ids.has(userPreset.id));
  assert.ok(currentEntries.every(entry => ids.has(entry.id)));
  assert.equal(saved.filter(entry => entry.kind === 'preset').length, 1);
  assert.equal(saved.find(entry => entry.kind === 'preset').text, 'user preset');
});

test('edited legacy seed and same-name user content are conservatively preserved', async t => {
  const f = await fixture(t), old = await seedV1(f);
  const original = await f.library.get(old[0].id);
  const edited = await f.library.put({ ...original, revision: original.revision, text: 'user edited legacy text' });
  const sameName = await f.library.put({ kind: 'preset', title: 'legacy-3', text: 'user-owned same name' });
  const result = await migrate(f), saved = await records(f.dataDir), byId = new Map(saved.map(entry => [entry.id, entry]));
  assert.equal(result.status, 'preserved_uncertain');
  assert.equal(result.removedCount, 0);
  assert.equal(byId.get(edited.id).text, 'user edited legacy text');
  assert.equal(byId.get(sameName.id).text, 'user-owned same name');
  assert.ok(old.every(entry => byId.has(entry.id)));
});

test('edited record at an official stable ID is never overwritten', async t => {
  const f = await fixture(t);
  const first = await f.library.put(currentEntries[0]);
  await f.library.put({ ...first, revision: first.revision, text: 'customized Rena' });
  const result = await migrate(f), saved = await records(f.dataDir), rena = saved.find(entry => entry.id === CURATED_SEED_IDS.Rena);
  assert.equal(result.removedCount, 0);
  assert.equal(rena.text, 'customized Rena');
  assert.equal(rena.revision, 2);
  assert.ok(saved.some(entry => entry.id === CURATED_SEED_IDS.Noire));
  assert.ok(saved.some(entry => entry.id === CURATED_SEED_IDS.Claire));
});

test('curated upgrade is idempotent after its receipt is written', async t => {
  const f = await fixture(t);
  await seedV1(f);
  await migrate(f);
  const before = await records(f.dataDir);
  const second = await migrate(f);
  const after = await records(f.dataDir);
  assert.equal(second.alreadyApplied, true);
  assert.deepEqual(after, before);
});
