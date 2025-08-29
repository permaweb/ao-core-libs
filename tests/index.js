import AOCore, { createSigner } from '@permaweb/ao-core-libs';
import fs from 'fs';

function expect(actual) {
	return {
		toBeDefined: () => {
			console.log('\x1b[90m%s\x1b[0m', `Checking if value is defined: ${JSON.stringify(actual)}`);
			if (actual === undefined) {
				throw new Error(`Expected value to be defined, but it was undefined`);
			}
			console.log('\x1b[32m%s\x1b[0m', 'Success: Value is defined');
		},
		toHaveProperty: (prop) => {
			console.log('\x1b[90m%s\x1b[0m', `Checking if object ${JSON.stringify(actual)} has property '${prop}'`);
			if (!(prop in actual)) {
				throw new Error(`Expected object to have property '${prop}', but it was not found`);
			}
			console.log('\x1b[32m%s\x1b[0m', `Success: Object has property '${prop}'`);
		},
		toEqualType: (expected) => {
			const actualType = typeof actual;
			const expectedType = typeof expected;
			console.log('\x1b[90m%s\x1b[0m', `Checking type, actual: ${actualType}, expected: ${expectedType}`);
			if (actualType !== expectedType) {
				throw new Error(`Type mismatch: expected ${expectedType}, but got ${actualType}`);
			}
			if (actualType === 'object' && actual !== null && expected !== null) {
				if (Array.isArray(actual) !== Array.isArray(expected)) {
					throw new Error(
						`Type mismatch: expected ${Array.isArray(expected) ? 'array' : 'object'}, but got ${Array.isArray(actual) ? 'array' : 'object'}`,
					);
				}
			}
			console.log('\x1b[32m%s\x1b[0m', `Success: Types match (${actualType})`);
		},
		toEqualLength: (expected) => {
			console.log('\x1b[90m%s\x1b[0m', `Checking length, actual: ${actual.length}, expected: ${expected}`);
			if (actual.length !== expected) {
				throw new Error(`Array length mismatch: expected length ${expected}, but got ${actual.length}`);
			}
			console.log('\x1b[32m%s\x1b[0m', `Success: Array length is equal (${actual.length})`);
		},
		toEqual: (expected) => {
			console.log(
				'\x1b[90m%s\x1b[0m',
				`Checking equality, actual: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)}`,
			);
			const actualType = typeof actual;
			const expectedType = typeof expected;
			if (actualType !== expectedType) {
				throw new Error(`Type mismatch: expected ${expectedType}, but got ${actualType}`);
			}

			if (actualType === 'object' && actual !== null && expected !== null) {
				const actualKeys = Object.keys(actual);
				const expectedKeys = Object.keys(expected);
				console.log(
					'\x1b[90m%s\x1b[0m',
					`Checking object keys, actual keys: ${JSON.stringify(actualKeys)}, expected keys: ${JSON.stringify(expectedKeys)}`,
				);
				if (actualKeys.length !== expectedKeys.length) {
					throw new Error(`Object key count mismatch: expected ${expectedKeys.length}, but got ${actualKeys.length}`);
				}

				for (const key of actualKeys) {
					if (!(key in expected)) {
						throw new Error(`Expected object is missing key: ${key}`);
					}
					expect(actual[key]).toEqual(expected[key]);
				}
			} else if (actual !== expected) {
				throw new Error(`Value mismatch: expected ${expected}, but got ${actual}`);
			}
			console.log('\x1b[32m%s\x1b[0m', 'Success: Values are equal');
		},
	};
}

function logTest(message) {
	console.log('\x1b[90m%s\x1b[0m', `\n${message}`);
}

function logError(message) {
	console.error('\x1b[31m%s\x1b[0m', `Error (${message})`);
}

(async function () {
	const jwk = JSON.parse(fs.readFileSync(process.env.PATH_TO_WALLET));

	let passed = 0;
	let failed = 0;

	async function runTest(name, fn) {
		try {
			await fn();
			logTest(`Pass: ${name}`);
			passed++;
		} catch (err) {
			logError(`Fail: ${name}`);
			console.error(err);
			failed++;
		}
	}

	const url = process.argv[2] || 'http://localhost:8734';

	logTest(`[AO Core Libs] Testing on URL: ${url}`);

	const aoCoreJwk = AOCore.init({ jwk, url });
	const aoCoreSigner = AOCore.init({ signer: createSigner(jwk), url });

	await runTest('Initialization from JWK', () => {
		expect(aoCoreJwk).toBeDefined();
	});

	let scheduler;
	let processId;

	await runTest('HTTP-SIG GET (DEFAULTS)', async () => {
		const res = await aoCoreSigner.request({
			path: '~meta@1.0/info/address',
		});
		expect(res).toBeDefined();
		expect(res.status).toEqual(200);

		scheduler = await res.text();
		expect(scheduler).toEqualType('string');
	});

	await runTest('HTTP-SIG GET (EXPLICIT)', async () => {
		const res = await aoCoreSigner.request({
			path: '~meta@1.0/info/address',
			method: 'GET',
			'signing-format': 'httpsig',
		});
		expect(res).toBeDefined();
		expect(res.status).toEqual(200);

		scheduler = await res.text();
		expect(scheduler).toEqualType('string');
	});

	await runTest('HTTP-SIG GET (JSON)', async () => {
		const res = await aoCoreSigner.request({
			path: '~meta@1.0/info/address',
			method: 'GET',
			'signing-format': 'httpsig',
			accept: 'application/json',
		});

		expect(res).toBeDefined();
		expect(res.status).toEqual(200);

		const parsed = await res.json();
		scheduler = parsed.body;
		expect(scheduler).toEqualType('string');
	});

	/* Set to the actual scheduler node */
	scheduler = 'NoZH3pueH0Cih6zjSNu_KRAcmg4ZJV1aGHKi0Pi5_Hc';

	await runTest('ANS-104 POST [Spawn]', async () => {
		const res = await aoCoreSigner.request({
			method: 'POST',
			'signing-format': 'ans104',
			path: '/push',
			'accept-bundle': 'true',
			'accept-codec': 'httpsig@1.0',
			device: 'process@1.0',
			scheduler: scheduler,
			'scheduler-location': scheduler,
			'scheduler-device': 'scheduler@1.0',
			'push-device': 'push@1.0',
			'execution-device': 'genesis-wasm@1.0',
			Authority: scheduler,
			Module: 'URgYpPQzvxxfYQtjrIQ116bl3YBfcImo3JEnNo8Hlrk',
			Type: 'Process',
			'Data-Protocol': 'ao',
			Variant: 'ao.N.1',
			data: '1984',
		});

		processId = res.headers.get('process');

		expect(res).toBeDefined();
		expect(res.status).toEqual(200);
		expect(processId).toEqualType('string');
	});

	if (!processId) {
		logError('Process Spawn Failed - Aborting');
		process.exit(1);
	}

	await runTest('ANS-104 POST', async () => {
		const res = await aoCoreSigner.request({
			method: 'POST',
			['signing-format']: 'ans104',
			path: `${processId}~process@1.0/compute/at-slot`,
		});
		expect(res).toBeDefined();
		expect(res.status).toEqual(200);
		const slot = await res.text();
		const isValidSlot = Number.isFinite(Number(slot));
		expect(isValidSlot).toEqual(true);
	});

	await runTest('HTTP-SIG POST', async () => {
		const res = await aoCoreSigner.request({
			method: 'POST',
			['signing-format']: 'httpsig',
			path: `${processId}~process@1.0/compute/at-slot`,
		});
		expect(res).toBeDefined();
		expect(res.status).toEqual(200);
		const slot = await res.text();
		const isValidSlot = Number.isFinite(Number(slot));
		expect(isValidSlot).toEqual(true);
	});

	logTest('\nAO Core Libs Test Summary:');
	console.log(`   \x1b[32mPassed\x1b[0m: ${passed}`);
	console.log(`   \x1b[31mFailed\x1b[0m: ${failed}`);

	if (failed > 0) console.log(`\x1b[31mAO Core Libs Tests Failed\x1b[0m`);
	else console.log(`\x1b[32mAll AO Core Libs Tests Passed\x1b[0m`);

	process.exit(failed > 0 ? 1 : 0);
})();
