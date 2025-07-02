import { constants, createHash, createPrivateKey, createSign } from 'crypto';

import { CreateFn, JWK, RequestFormatType, SignatureResult, SignerOptions, SignerType } from './types';
import { CryptographicError, ErrorCode } from './errors';

export function createANS104Signer({
	privateKey,
	publicKey,
	address,
}: SignerOptions): (create: CreateFn) => Promise<SignatureResult> {
	return async (create) => {
		// 1) ask the create‐fn for our deep‐hash
		const deepHash = await create({
			type: 1,
			publicKey,
			alg: 'rsa-v1_5-sha256',
		});

		// 2) sign it with RSA-PSS SHA-256
		const signature = createSign('sha256')
			.update(deepHash as Uint8Array) // deepHash is Uint8Array here
			.sign({ key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING });

		return { signature, address };
	};
}

export function createHttpSigner({
	privateKey,
	publicKey,
	address,
}: SignerOptions): (create: CreateFn) => Promise<SignatureResult> {
	return async (create) => {
		// 1) ask the create‐fn for our HTTP-SIG base bytes
		const signatureBase = await create({
			type: 1,
			publicKey,
			alg: 'rsa-pss-sha512',
		});

		// 2) sign with RSA-PSS SHA-512
		const signature = createSign('sha512')
			.update(signatureBase as Uint8Array)
			.sign({ key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING });

		return { signature, address };
	};
}

/**
 * Build a multi-purpose signer from a JWK‐style wallet
 * @param wallet - your JWK object containing at least `n` and private fields
 * @returns a SignerType that delegates to ANS-104 or HTTP-SIG based on `kind`
 */
export function createSigner(wallet: JWK): SignerType {
	// decode the base64url public modulus
	const publicKey = Buffer.from(wallet.n, 'base64url');

	// turn the JWK into a Crypto KeyObject
	const privateKey = createPrivateKey({ key: wallet, format: 'jwk' });

	// derive the Arweave address = sha256(publicKey) in base64url
	const address = createHash('sha256').update(publicKey).digest('base64url');

	const dataItemSigner = createANS104Signer({ privateKey, publicKey, address });
	const httpSigner = createHttpSigner({ privateKey, publicKey, address });

	return (create: CreateFn, kind: RequestFormatType) => {
		switch (kind) {
			case RequestFormatType.ANS_104:
				return dataItemSigner(create);
			case RequestFormatType.HTTP_SIG:
				return httpSigner(create);
			default:
				throw new CryptographicError(
					ErrorCode.CRYPTO_SIGNER_TYPE_UNKNOWN,
					`Unknown signer type: ${kind}`,
					{
						provided: kind,
						supportedTypes: Object.values(RequestFormatType),
						suggestion: 'Use ANS-104 or HTTP-SIG signing format'
					}
				);
		}
	};
}
