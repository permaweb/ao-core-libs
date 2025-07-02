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

	const aoCoreJwk = AOCore.init({ jwk });
	const aoCoreSigner = AOCore.init({ signer: createSigner(jwk) });

	await runTest('Initialization from JWK', () => {
		expect(aoCoreJwk).toBeDefined();
	});

	await runTest('ANS-104 GET', async () => {
		const res = await aoCoreSigner.request({
			method: 'GET',
			signingFormat: 'ans104',
			path: 'router~node-process@1.0/now/routes/serialize~json@1.0',
		});
		expect(res).toBeDefined();
		expect(res.status).toEqual(200);
	});

	await runTest('HTTP-SIG GET (defaults)', async () => {
		const res = await aoCoreSigner.request({
			path: 'router~node-process@1.0/now/routes/serialize~json@1.0',
		});
		expect(res).toBeDefined();
		expect(res.url).toEqual('https://forward.computer/router~node-process@1.0/now/routes/serialize~json@1.0');
		expect(res.status).toEqual(200);
	});

	await runTest('HTTP-SIG GET (explicit)', async () => {
		const res = await aoCoreSigner.request({
			method: 'GET',
			signingFormat: 'httpsig',
			path: 'router~node-process@1.0/now/routes/serialize~json@1.0',
		});
		expect(res).toBeDefined();
		expect(res.url).toEqual('https://forward.computer/router~node-process@1.0/now/routes/serialize~json@1.0');
		expect(res.status).toEqual(200);
	});

	await runTest('ANS-104 POST', async () => {
		const res = await aoCoreSigner.request({
			method: 'POST',
			signingFormat: 'ans104',
			path: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
		});
		expect(res).toBeDefined();
		expect(res.url).toEqual(
			'https://forward.computer/JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
		);
		expect(res.status).toEqual(200);
		const text = await res.text();
		expect(text).toEqual('5937');
	});

	await runTest('HTTP-SIG POST', async () => {
		const res = await aoCoreSigner.request({
			method: 'POST',
			signingFormat: 'httpsig',
			path: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
		});
		expect(res).toBeDefined();
		expect(res.url).toEqual(
			'https://forward.computer/JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
		);
		expect(res.status).toEqual(200);
		const text = await res.text();
		expect(text).toEqual('5937');
	});

	console.log('\nTest Summary:');
	console.log(`    Passed: ${passed}`);
	console.log(`    Failed: ${failed}`);

	process.exit(failed > 0 ? 1 : 0);
})();
