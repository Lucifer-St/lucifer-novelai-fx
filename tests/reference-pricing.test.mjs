import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteAnlas, opusEligibility } from '../src/lib/anlas.mjs';
import { opusEstimate } from '../src/lib/opus-usage.mjs';

function request(model = 'nai-diffusion-4-5-full', parameters = {}) {
  return { model, novelai: { endpoint: '/ai/generate-image', body: { model, action: 'generate', input: 'room', parameters: { width: 832, height: 1216, steps: 28, n_samples: 1, ...parameters } } } };
}

test('V4.5 Opus single image has conditional zero base, while Precise makes base unknown', () => {
  const plain = request();
  assert.equal(opusEligibility(plain).eligible, true);
  const free = quoteAnlas(plain, [], { policy: 'opus' });
  assert.equal(free.amount, 0);
  assert.equal(free.conditional, true);
  assert.equal(opusEstimate(plain, 'opus').percent, null);
  const precise = quoteAnlas(request('nai-diffusion-4-5-curated', { director_reference_images: ['one', 'two'] }), [], { policy: 'opus' });
  assert.equal(precise.known, false);
  assert.equal(precise.amount, null);
  assert.equal(precise.referenceExtra, 10);
  const vibes = quoteAnlas(request('nai-diffusion-4-5-full', { reference_image_multiple: ['1', '2', '3', '4', '5'] }), [], { policy: 'opus' });
  assert.equal(vibes.amount, 2);
  assert.equal(vibes.vibeExtra, 2);
});

test('V4.5 paid base remains unknown without a matching manual calibration', () => {
  const quote = quoteAnlas(request('nai-diffusion-4-5-full', { director_reference_images: ['one'] }), [], { policy: 'paid' });
  assert.equal(quote.known, false);
  assert.equal(quote.amount, null);
  assert.equal(quote.referenceExtra, 5);
});

test('new Vibe encoding has a separate known two-Anlas estimate', () => {
  const quote = quoteAnlas({ novelai: { endpoint: '/ai/encode-vibe', body: { model: 'nai-diffusion-4-5-full' } } });
  assert.equal(quote.known, true);
  assert.equal(quote.amount, 2);
  assert.equal(quote.source, 'official_vibe_encoding');
});
