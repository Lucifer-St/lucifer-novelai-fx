import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStudioServer } from '../server/index.mjs';
import { defaults, buildRequest } from '../src/lib/request.mjs';

const SHARE = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).name.endsWith('-share');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
const ENCODED = Buffer.from('fixture-vibe-binary');
const vault = { seal: async key => Buffer.from(key).toString('base64'), open: async sealed => Buffer.from(sealed, 'base64').toString() };

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fx-model-server-'));
  const dataDir = path.join(dir, 'data'), distDir = path.join(dir, 'dist'), keyPath = path.join(dir, 'fixture.key');
  await mkdir(distDir);
  await writeFile(path.join(distDir, 'index.html'), 'fixture');
  await writeFile(keyPath, 'fixture-only-not-a-real-key');
  const calls = [];
  const server = createStudioServer({ root: dir, dataDir, distDir, keyPath, vault,
    outputDir: path.join(dir, 'output'), saveDir: path.join(dir, 'saved'), authDir: path.join(dir, 'auth'),
    fetchImpl: async (url, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), method: init.method, body });
      if (body?.novelai?.endpoint === '/ai/encode-vibe') return new Response(ENCODED, { headers: { 'Content-Type': 'application/octet-stream' } });
      return Response.json({ data: [{ b64_json: PNG.toString('base64') }] });
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  if (SHARE) {
    const config = await send('/api/settings', 'POST', { provider: 'openai', baseURL: 'https://fixture.invalid', key: 'fixture-only-not-a-real-key' });
    assert.equal(config.status, 200, JSON.stringify(config.data));
  }
  return { dir, calls, send };
}

function payload(model) { return buildRequest({ ...defaults(model), prompt: 'portrait', seed: 42 }); }
async function until(check) { for (let i = 0; i < 150; i++) { const value = await check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('Fixture state did not settle'); }

test('V5 reference payloads are blocked before upstream on job, request and native routes', async t => {
  const f = await fixture(t), request = payload('nai-diffusion-5-full');
  request.novelai.body.parameters.director_reference_images = [PNG.toString('base64')];
  const jobId = randomUUID();
  const accepted = await f.send('/api/generation-jobs', 'POST', { clientRequestId: jobId, payload: request });
  assert.equal(accepted.status, 202);
  const job = await until(async () => { const r = await f.send('/api/generation-jobs/' + jobId); return ['error', 'success'].includes(r.data.status) ? r.data : null; });
  assert.equal(job.status, 'error');
  // Terminal status is observable before the durable write releases the job slot.
  await until(async () => { const r=await f.send('/api/status');return !r.data.activeGeneration&&!r.data.generationBusy; });
  const shortcut = await f.send('/api/request', 'POST', { payload: request });
  assert.equal(shortcut.status, 400, JSON.stringify(shortcut.data));
  const native = await f.send('/api/native', 'POST', { route: '/ai/generate-image', body: request.novelai.body });
  assert.equal(native.status, 400, JSON.stringify(native.data));
  assert.equal(f.calls.length, 0);
});

test('V4.5 Full and Curated forward exact models; new result indexes and favorite survives rebuild', async t => {
  const f = await fixture(t);
  let last;
  for (const model of ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated']) {
    const response = await f.send('/api/request', 'POST', { payload: payload(model) });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    last = response.data;
    assert.equal(f.calls.at(-1).body.novelai.body.model, model);
    assert.equal(f.calls.at(-1).body.model, model);
  }
  const results = await until(async () => { const r = await f.send('/api/generated-library?q=portrait'); return r.data.items?.some(item => item.result_id === last.id) ? r.data : null; });
  assert.ok(results.items.some(item => item.result_id === last.id));
  const favorite = await f.send('/api/generated-library/annotation', 'PATCH', { id: last.id, index: 0, favorite: true, tags: ['fixture'] });
  assert.equal(favorite.status, 200, JSON.stringify(favorite.data));
  const backup = await f.send('/api/generated-library/annotations');
  assert.equal(backup.data.items[`${last.id}:0`].favorite, true);
  const rebuild = await f.send('/api/generated-library/rebuild', 'POST', {});
  assert.equal(rebuild.status, 202);
  const rebuilt = await until(async () => { const r = await f.send('/api/generated-library?favorite=1'); return r.data.items?.some(item => item.result_id === last.id) ? r.data : null; });
  assert.equal(rebuilt.items.find(item => item.result_id === last.id).tags[0], 'fixture');
});

test('explicit V4.5 vibe encoding returns binary Base64, caches by model and IE, and rejects V5', async t => {
  const f = await fixture(t), image = PNG.toString('base64');
  const encode = (model, information = 0.7) => f.send('/api/reference/encode', 'POST', { model, image, information, requestId: randomUUID() });
  const first = await encode('nai-diffusion-4-5-full');
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.encoding, ENCODED.toString('base64'));
  assert.equal(first.data.cached, false);
  const second = await encode('nai-diffusion-4-5-full');
  assert.equal(second.data.encoding, first.data.encoding);
  assert.equal(second.data.cached, true);
  assert.equal(f.calls.length, 1);
  const curated = await encode('nai-diffusion-4-5-curated');
  assert.equal(curated.status, 200);
  assert.equal(f.calls.length, 2);
  const otherIE = await encode('nai-diffusion-4-5-full', 0.8);
  assert.equal(otherIE.status, 200);
  assert.equal(f.calls.length, 3);
  const rejected = await encode('nai-diffusion-5-full');
  assert.equal(rejected.status, 400);
  assert.equal(f.calls.length, 3);
});
