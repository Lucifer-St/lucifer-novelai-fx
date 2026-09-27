import test from 'node:test';
import assert from 'node:assert/strict';
import { runCLI } from '../scripts/fx.mjs';
import { createMcpHandler } from '../scripts/fx-mcp.mjs';

const models = ['nai-diffusion-5-full', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated'];

test('CLI defaults, schema and plan are model-aware and offline', async () => {
  let calls = 0;
  const options = { fetchImpl: () => { calls++; throw Error('network not allowed'); } };
  for (const model of models) {
    const defaults = (await runCLI(['defaults', '--model', model], options)).data.state;
    const schema = (await runCLI(['schema', '--model', model], options)).data;
    const plan = (await runCLI(['plan', '--model', model, '--prompt', 'a quiet room', '--seed', '42'], options)).data;
    assert.equal(defaults.model, model);
    assert.equal(schema.modelSchema.id, model);
    assert.equal(plan.payload.model, model);
    assert.equal(plan.payload.novelai.body.model, model);
    assert.equal(plan.payload.novelai.body.parameters.params_version, 4);
    const noQuality = (await runCLI(['plan', '--model', model, '--prompt', 'portrait', '--no-quality'], options)).data.payload.novelai.body.parameters;
    assert.equal(noQuality.qualityToggle, false);
    assert.equal(noQuality.tag_hint_qt, model === 'nai-diffusion-5-full' ? 0 : undefined);
  }
  assert.equal(calls, 0);
  await assert.rejects(runCLI(['plan', '--model', 'nai-diffusion-5-curated', '--prompt', 'room'], options), /模型必须/);
});

test('MCP offline planning supports the same three models and rejects unsupported ones', async () => {
  const handle = createMcpHandler({ fetchImpl: () => { throw Error('network not allowed'); } });
  await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  for (const model of models) {
    const reply = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'fx_plan', arguments: { state: { model, prompt: 'a quiet room', seed: 42 } } } });
    assert.equal(reply.result.isError, false);
    const plan = JSON.parse(reply.result.content[0].text);
    assert.equal(plan.payload.model, model);
  }
  const rejected = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fx_plan', arguments: { state: { model: 'nai-diffusion-5-curated', prompt: 'room' } } } });
  assert.equal(rejected.result.isError, true);
});
