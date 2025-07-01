import AOCore from '@permaweb/ao-core-sdk';
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
	const aoCore = AOCore.init({ jwk });

	const postAns104 = await aoCore.request({
		method: 'POST',
		format: 'ANS-104',
		process: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk',
		path: 'compute/at-slot',
		fields: {
			target: 'uf_FqRvLqjnFMc8ZzGkF4qWKuNmUIQcYP0tPlCGORQk',
			anchor: '',
			test: '1234',
			data: '1234'
		}
	});

	expect(postAns104).toBeDefined();

	expect(postAns104.url).toEqual('https://forward.computer/JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot');
	expect(postAns104.status).toEqual(200);

	const postAns104ResponseData = await postAns104.text();
	expect(postAns104ResponseData).toEqual('5937');

	const postHttpSig = await aoCore.request({
		method: 'POST',
		format: 'HTTP-SIG',
		process: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk',
		path: 'compute/at-slot',
		fields: {
			target: 'uf_FqRvLqjnFMc8ZzGkF4qWKuNmUIQcYP0tPlCGORQk',
			anchor: '',
			test: '1234',
			data: '1234'
		}
	});

	expect(postHttpSig).toBeDefined();

	expect(postHttpSig.url).toEqual('https://forward.computer/JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot');
	expect(postHttpSig.status).toEqual(200);

	const postHttpSigResponseData = await postHttpSig.text();
	expect(postHttpSigResponseData).toEqual('5937');
})();
