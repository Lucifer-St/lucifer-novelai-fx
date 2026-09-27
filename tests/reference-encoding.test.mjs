import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createReferenceEncoding } from '../server/reference-encoding.mjs';

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
const encoding = Buffer.from('test-vibe-binary').toString('base64');
const model = 'nai-diffusion-4-5-full';
const args = requestId => ({ model, image, information: 0.7, requestId });

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fx-ref-encode-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('explicit V4.5 encode creates a durable receipt and reuses cached encoding after restart', async t => {
  const directory = await fixture(t);
  let calls = 0;
  const first = createReferenceEncoding({ directory, encode: async payload => {
    calls++;
    assert.deepEqual(payload, { model, image, information_extracted: 0.7, requestId: 'request-0001' });
    return encoding;
  }});
  const result = await first.encode(args('request-0001'));
  assert.equal(result.status, 'completed');
  assert.equal(result.encoding, encoding);
  assert.equal(result.cached, false);
  assert.equal((await first.status('request-0001')).encoding, encoding);
  const restarted = createReferenceEncoding({ directory, encode: async () => { calls++; return encoding; } });
  assert.equal((await restarted.encode(args('request-0001'))).replay, true);
  const reused = await restarted.encode(args('request-0002'));
  assert.equal(reused.status, 'completed');
  assert.equal(reused.cached, true);
  assert.equal(calls, 1);
  const files = await readdir(path.join(directory, 'requests'));
  assert.equal(files.length, 2);
  const receipt = await readFile(path.join(directory, 'requests', 'request-0001.json'), 'utf8');
  assert.equal(receipt.includes(image), false);
});

test('invalid model, image, information and reused ID are blocked before the paid callback', async t => {
  const directory = await fixture(t);
  let calls = 0;
  const service = createReferenceEncoding({ directory, encode: async () => { calls++; return encoding; } });
  assert.throws(() => service.encode({ ...args('request-0001'), model: 'nai-diffusion-5-full' }), { code: 'unsupported_reference_model' });
  assert.throws(() => service.encode({ ...args('request-0001'), image: 'Zm9v' }), /PNG/);
  assert.throws(() => service.encode({ ...args('request-0001'), information: 1.5 }), /0–1/);
  assert.throws(() => service.encode({ ...args('request-0001'), requestId: 'bad/id' }), /ID/);
  assert.equal(calls, 0);
  await service.encode(args('request-0001'));
  await assert.rejects(service.encode({ ...args('request-0001'), information: 0.8 }), { code: 'idempotency_conflict' });
  assert.equal(calls, 1);
});

test('ambiguous failure and interrupted receipt never resend the same request ID', async t => {
  const directory = await fixture(t);
  let calls = 0;
  const failing = createReferenceEncoding({ directory, encode: async () => { calls++; throw Error('connection closed'); } });
  const result = await failing.encode(args('request-0001'));
  assert.deepEqual({ status: result.status, billingUnknown: result.billingUnknown }, { status: 'unknown', billingUnknown: true });
  const restarted = createReferenceEncoding({ directory, encode: async () => { calls++; return encoding; } });
  assert.equal((await restarted.encode(args('request-0001'))).status, 'unknown');
  assert.equal(calls, 1);
});

test('concurrent same-image actions run one encode and return cache on the second ID', async t => {
  const directory = await fixture(t);
  let calls = 0;
  const service = createReferenceEncoding({ directory, encode: async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return encoding;
  }});
  const [one, repeat, two] = await Promise.all([
    service.encode(args('request-0001')),
    service.encode(args('request-0001')),
    service.encode(args('request-0002')),
  ]);
  assert.equal(one.status, 'completed');
  assert.equal(repeat.status, 'completed');
  assert.equal(two.cached, true);
  assert.equal(calls, 1);
});
