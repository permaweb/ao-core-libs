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

type Request = (args: RequestType) => Promise<Response>;

const ADDRESS = /^[A-Za-z0-9_-]{43}$/;
const hex = (length: number) => new RegExp(`^[0-9a-fA-F]{${length}}$`);

/**
 * Thin client for the HyperBEAM RNG protocol through the preloaded `rng@1.0`
 * device. RNG Labs, a CipherPlay Inc. product, maintains the protocol.
 */
export function rng(request: Request) {
	return {
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
	};
}
