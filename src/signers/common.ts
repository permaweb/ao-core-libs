import { constants, createHash, createPrivateKey, createSign } from 'crypto';

import { CryptographicError, ErrorCode } from '../helpers/errors.ts';
import { cryptoRateLimiter, validateJWK, validateSignatureData } from '../helpers/security.ts';
import { CreateFn, JWK, SignatureResult, SignerOptions, SignerType, SigningFormatType } from '../helpers/types.ts';

export function createANS104Signer({
	privateKey,
	publicKey,
	address,
}: SignerOptions): (create: CreateFn) => Promise<SignatureResult> {
	return async (create) => {
		// 1) Ask the create‐fn for our deep‐hash
		const deepHash = await create({
			type: 1,
			publicKey,
			alg: 'rsa-v1_5-sha256',
		});

		// Validate the data to be signed
		if (!(deepHash instanceof Uint8Array)) {
			throw new CryptographicError(ErrorCode.CRYPTO_INVALID_SIGNATURE, 'Invalid data format for ANS-104 signing', {
				suggestion: 'Deep hash must be Uint8Array',
			});
		}

		// 2) sign it with RSA-PSS SHA-256
		const signature = createSign('sha256')
			.update(deepHash)
			.sign({ key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING });

		// Validate the signature was created properly
		validateSignatureData(signature, 'ANS-104 signature');

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

		// Validate the signature base
		if (!(signatureBase instanceof Uint8Array)) {
			throw new CryptographicError(ErrorCode.CRYPTO_INVALID_SIGNATURE, 'Invalid data format for HTTP signature', {
				suggestion: 'Signature base must be Uint8Array',
			});
		}

		// 2) sign with RSA-PSS SHA-512
		const signature = createSign('sha512')
			.update(signatureBase)
			.sign({ key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING });

		// Validate the signature was created properly
		validateSignatureData(signature, 'HTTP signature');

		return { signature, address };
	};
}

/**
 * Build a multi-purpose signer from a JWK‐style wallet
 * @param wallet - your JWK object containing at least `n` and private fields
 * @returns a SignerType that delegates to ANS-104 or HTTP-SIG based on `kind`
 */
export function createSigner(wallet: JWK): SignerType {
	// Validate JWK security properties
	validateJWK(wallet);

	// Apply rate limiting to prevent abuse
	const walletId = createHash('sha256').update(wallet.n).digest('hex');
	cryptoRateLimiter.checkLimit(`signer-${walletId}`);

	// Decode the base64url public modulus
	const publicKey = Buffer.from(wallet.n, 'base64url');

	// Turn the JWK into a Crypto KeyObject
	const privateKey = createPrivateKey({ key: wallet as any, format: 'jwk' });

	// Derive the Arweave address = sha256(publicKey) in base64url
	const address = createHash('sha256').update(publicKey).digest('base64url');

	const dataItemSigner = createANS104Signer({ privateKey, publicKey, address });
	const httpSigner = createHttpSigner({ privateKey, publicKey, address });

	return (create: CreateFn, kind: SigningFormatType) => {
		switch (kind) {
			case SigningFormatType.ANS_104:
				return dataItemSigner(create);
			case SigningFormatType.HTTP_SIG:
				return httpSigner(create);
			default:
				throw new CryptographicError(ErrorCode.CRYPTO_SIGNER_TYPE_UNKNOWN, `Unknown signer type: ${kind}`, {
					provided: kind,
					supportedTypes: Object.values(SigningFormatType),
					suggestion: 'Use ANS-104 or HTTP-SIG signing format',
				});
		}
	};
}
