import assert from 'node:assert/strict';
import test from 'node:test';

import AOCore from '../dist/index.js';

function client() {
	const paths = [];
	globalThis.fetch = async (input) => {
		paths.push(new URL(String(input)).pathname);
		return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { rng: AOCore.init({ url: 'https://example.test' }).rng, paths };
}

test('Any-Honest helpers use the unified rng device', async () => {
	const { rng, paths } = client();
	await rng.generator();
	await rng.verifyReveal({ c: '1', alpha: '2', h: '3' });
	await rng.verifyCrack({ x: '1', t: 8, y: '2', proof: '3' });
	assert.deepEqual(paths, [
		'/~rng@1.0/generator',
		'/~rng@1.0/verify-reveal',
		'/~rng@1.0/verify-crack',
	]);
});

test('Any-Honest helpers reject ambiguous or excessive values before transport', () => {
	const { rng } = client();
	assert.throws(() => rng.verifyReveal({ c: '01', alpha: '2', h: '3' }), /canonical hex/);
	assert.throws(() => rng.verifyReveal({ c: '1', alpha: 'A', h: '3' }), /canonical hex/);
	assert.throws(() => rng.verifyCrack({ x: '1', t: 2 ** 32 + 1, y: '2', proof: '3' }), /2\^32/);
	assert.throws(() => rng.verifyCrack({ x: '1', t: 8, y: 'g', proof: '3' }), /canonical hex/);
});
