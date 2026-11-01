import { RequestType } from '../helpers/types.ts';

export interface VerifyRoundArgs {
	publicKey: string;
	beacon: string;
	round: number;
	signature: string;
}

export interface DeriveRandomArgs {
	seed: string | Uint8Array;
	counter: number;
	bytes: number;
}

export interface VerifyRevealArgs {
	c: string;
	alpha: string;
	h: string;
}

export interface VerifyCrackArgs {
	x: string;
	t: number;
	y: string;
	proof: string;
}

type Request = (args: RequestType) => Promise<Response>;

const ADDRESS = /^[A-Za-z0-9_-]{43}$/;
const hex = (length: number) => new RegExp(`^[0-9a-fA-F]{${length}}$`);
const canonicalHex = /^(0|[1-9a-f][0-9a-f]*)$/;

function assertCanonicalHex(name: string, value: string, maxLength: number) {
	if (!canonicalHex.test(value) || value.length > maxLength) {
		throw new TypeError(`${name} must be lowercase canonical hex of at most ${maxLength} characters`);
	}
}

/**
 * Thin client for the HyperBEAM RNG protocol through the preloaded `rng@1.0`
 * device. RNG Labs, a CipherPlay Inc. product, maintains the protocol.
 */
export function rng(request: Request) {
	return {
		generator: () => request({ path: '~rng@1.0/generator', accept: 'application/json' }),
		verifyRound: ({ publicKey, beacon, round, signature }: VerifyRoundArgs) => {
			if (!hex(96).test(publicKey)) throw new TypeError('publicKey must be a 48-byte compressed G1 point in hex');
			if (!ADDRESS.test(beacon)) throw new TypeError('beacon must be a 43-character AO process id');
			if (!Number.isSafeInteger(round) || round < 1) throw new RangeError('round must be a positive integer');
			if (!hex(192).test(signature)) throw new TypeError('signature must be a 96-byte compressed G2 point in hex');
			return request({
				path: '~rng@1.0/verify-bls',
				accept: 'application/json',
				'public-key': publicKey,
				message: `hyperbeam/rng/v1|${beacon}|${round}`,
				signature,
			});
		},
		derive: ({ seed, counter, bytes }: DeriveRandomArgs) => {
			if (!Number.isSafeInteger(counter) || counter < 0) throw new RangeError('counter must be a non-negative integer');
			if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 1024) {
				throw new RangeError('bytes must be an integer from 1 to 1024');
			}
			return request({
				path: '~rng@1.0/derive',
				accept: 'application/json',
				seed,
				counter,
				bytes,
			});
		},
		verifyReveal: ({ c, alpha, h }: VerifyRevealArgs) => {
			assertCanonicalHex('c', c, 512);
			assertCanonicalHex('alpha', alpha, 128);
			assertCanonicalHex('h', h, 512);
			return request({ path: '~rng@1.0/verify-reveal', accept: 'application/json', c, alpha, h });
		},
		verifyCrack: ({ x, t, y, proof }: VerifyCrackArgs) => {
			assertCanonicalHex('x', x, 512);
			if (!Number.isSafeInteger(t) || t < 0 || t > 2 ** 32) {
				throw new RangeError('t must be an integer from 0 to 2^32');
			}
			assertCanonicalHex('y', y, 512);
			assertCanonicalHex('proof', proof, 512);
			return request({ path: '~rng@1.0/verify-crack', accept: 'application/json', x, t, y, proof });
		},
	};
}
