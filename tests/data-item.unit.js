import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const bundled = await build({
	entryPoints: ['src/helpers/data-item.ts'],
	bundle: true,
	format: 'cjs',
	platform: 'node',
	write: false,
});
const bundledModule = { exports: {} };
const loadBundle = new Function('require', 'module', 'exports', bundled.outputFiles[0].text);
loadBundle(createRequire(import.meta.url), bundledModule, bundledModule.exports);
const { toANS104Request } = bundledModule.exports;

test('keeps signing and codec controls outside the signed ANS-104 tags', () => {
	const result = toANS104Request({
		'signing-format': 'ans104',
		'accept-bundle': 'true',
		accept: 'application/json',
		'accept-codec': 'httpsig@1.0',
		'require-codec': 'application/json',
		'custom-codec-option': 'transport-only',
		Action: 'Ping',
	});

	assert.equal(result.headers['signing-format'], 'ans104');
	assert.equal(result.headers['accept-bundle'], 'true');
	assert.equal(result.headers.accept, 'application/json');
	assert.equal(result.headers['accept-codec'], 'httpsig@1.0');
	assert.equal(result.headers['require-codec'], 'application/json');
	assert.equal(result.headers['custom-codec-option'], 'transport-only');
	assert.equal(result.headers['codec-device'], 'ans104@1.0');

	const tagNames = result.item.tags.map(({ name }) => name.toLowerCase());
	assert.equal(tagNames.includes('signing-format'), false);
	assert.equal(tagNames.includes('accept-bundle'), false);
	assert.equal(tagNames.includes('accept'), false);
	assert.equal(
		tagNames.some((name) => name.includes('codec')),
		false,
	);
	assert.equal(
		result.item.tags.some(({ name, value }) => name === 'Action' && value === 'Ping'),
		true,
	);
});

test('preserves lowercase canonical AO tags for Lua messages', () => {
	const result = toANS104Request({
		type: 'Process',
		'data-protocol': 'ao',
		variant: 'ao.N.1',
		'content-type': 'application/lua',
	});

	assert.deepEqual(
		result.item.tags.map(({ name }) => name),
		['content-type', 'data-protocol', 'type', 'variant'],
	);
});

test('retains canonical casing for existing non-Lua callers', () => {
	const result = toANS104Request({
		Type: 'Message',
		'Data-Protocol': 'ao',
		Variant: 'ao.N.1',
	});

	assert.deepEqual(
		result.item.tags.map(({ name }) => name),
		['Data-Protocol', 'Type', 'Variant'],
	);
});
