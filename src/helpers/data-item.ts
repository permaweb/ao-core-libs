import { createData, DataItem, SIG_CONFIG } from '@dha-team/arbundles';

import { CryptographicError, ErrorCode, ValidationError } from './errors.ts';
import { validateHashInput, validateSignatureData } from './security.ts';
import { CreateInput, DataItemFields, SignerType, SigningFormatType } from './types.ts';
import { debugLog, encodeBase64Url, sha256, toView, toViewBuffer } from './utils.ts';

// Import base64url for ao/connect compatibility
let base64url: any;
try {
	// @ts-ignore
	base64url = require('base64url');
} catch {}

export function createDataItemBytes(data: any, signer: any, opts: any) {
	const signerMeta = (SIG_CONFIG as any)[signer.type];
	if (!signerMeta) {
		throw new CryptographicError(
			ErrorCode.CRYPTO_SIGNATURE_METADATA_NOT_FOUND,
			`No metadata found for signature type ${signer.type}`,
			{
				signerType: signer.type,
				availableTypes: Object.keys(SIG_CONFIG),
				suggestion: 'Verify signer type is supported by arbundles library',
			},
		);
	}

	signerMeta.signatureType = signer.type;
	signerMeta.ownerLength = signerMeta.pubLength;
	signerMeta.signatureLength = signerMeta.sigLength;
	signerMeta.publicKey = signer.publicKey;

	const dataItem = createData(data, signerMeta, opts);
	return dataItem.getRaw();
}

export async function getRawAndId(dataItemBytes: Uint8Array) {
	// Validate input data
	validateHashInput(dataItemBytes, 'data item bytes');

	const dataItem = new DataItem(dataItemBytes);

	/**
	 * arbundles dataItem.id does not work in browser environments
	 * so we replicate it's behavior using impl that works
	 * on node and browser
	 */
	const rawSignature = dataItem.rawSignature;
	validateHashInput(rawSignature, 'signature for ID calculation');
	const rawId = await sha256(rawSignature.buffer);

	return {
		id: encodeBase64Url(rawId),
		raw: dataItem.getRaw(),
	};
}

export function getSignatureData(dataItemBytes: Uint8Array) {
	const dataItem = new DataItem(dataItemBytes);
	return dataItem.getSignatureData();
}

export function verify(dataItemBytes: Uint8Array) {
	return DataItem.verify(dataItemBytes);
}

export function toDataItemSigner(signer: SignerType) {
	return async function ({ data, tags, target, anchor }: DataItemFields) {
		let unsignedBytes: Uint8Array | null = null;
		let createCalled = false;

		// This function will be called by the signer to build
		// and hash the data‐item payload.
		async function create(injected: CreateInput) {
			createCalled = true;

			// Passthrough option: signer wants raw fields instead of bytes
			if (injected.passthrough) {
				return { data, tags, target, anchor };
			}

			// Default type/alg, extract publicKey
			const { publicKey, type = 1, alg = 'rsa-v1_5-sha256' } = injected;

			/* Build the unsigned bytes for the data item */
			unsignedBytes = createDataItemBytes(data, { type, publicKey: toViewBuffer(publicKey) }, { target, tags, anchor });

			debugLog('info', 'Unsigned Bytes', unsignedBytes);

			// Then return its deep‐hash for the signer to sign
			const deepHash = await getSignatureData(unsignedBytes);

			return deepHash;
		}

		// Ask the signer to sign our payload
		const res = await signer(create, SigningFormatType.ANS_104);

		debugLog('info', 'Signed Result', res);

		// Make sure create() actually ran
		if (!createCalled) {
			throw new CryptographicError(ErrorCode.CRYPTO_CREATE_NOT_INVOKED, 'Signer did not invoke create() function', {
				suggestion: 'Check signer implementation - create() must be called to generate signature data',
			});
		}

		// If the signer already returned a full DataItem, just pass it through
		if (res && typeof res === 'object' && res.id && res.raw) {
			return res;
		}

		// Otherwise, expect a signature blob
		if (!res.signature) {
			throw new CryptographicError(
				ErrorCode.CRYPTO_MISSING_SIGNATURE,
				'Signer result missing required signature property',
				{
					returned: Object.keys(res || {}),
					suggestion: 'Signer must return an object with signature property',
				},
			);
		}
		const rawSig = toViewBuffer(res.signature);

		// Splice the raw signature into the unsigned bytes (match ao/connect exactly)
		const signedBytes = unsignedBytes!;
		signedBytes.set(rawSig, 2);

		// Validate signature data before verification
		validateSignatureData(rawSig, 'data item signature');

		// Verify it before returning
		const isValid = await verify(signedBytes);
		if (!isValid) {
			throw new CryptographicError(
				ErrorCode.CRYPTO_INVALID_SIGNATURE,
				'Generated data item signature failed validation',
				{
					suggestion: 'Check wallet private key and signing implementation',
				},
			);
		}

		// Compute the DataItem ID = base64url( SHA-256(rawSig) ) - match ao/connect exactly
		const hashResult = await crypto.subtle.digest('SHA-256', rawSig);
		const id = base64url && base64url.encode ? base64url.encode(Buffer.from(hashResult)) : encodeBase64Url(hashResult);

		return { id, raw: signedBytes };
	};
}

export function toANS104Request(fields: DataItemFields): { headers: Record<string, string>; item: any } {
	if (!fields) {
		throw new ValidationError(ErrorCode.VALIDATION_MISSING_FIELDS, 'Fields object is required for ANS-104 request', {
			suggestion: 'Provide an object with request fields (data, target, etc.)',
		});
	}

	const { target = '', anchor = '', data = '', Type, Variant, ...rest } = fields;

	const excludeList = ['target', 'anchor', 'data', 'data-protocol', 'variant', 'dryrun', 'type', 'path', 'method'];

	const exclude = new Set(excludeList);

	// Combine filter and map operations into single loop for better performance
	const dynamicTags: Array<{ name: string; value: string }> = [];
	for (const [name, value] of Object.entries(rest)) {
		if (!exclude.has(name.toLowerCase())) {
			dynamicTags.push({
				name,
				value: String(value),
			});
		}
		dynamicTags.push({
			name,
			value: String(value),
		});
	}

	const tags = [
		...dynamicTags,
		{ name: 'Data-Protocol', value: 'ao' },
		{ name: 'Type', value: Type ?? 'Message' },
		{ name: 'Variant', value: Variant ?? 'ao.N.1' },
	];

	const dataItem = {
		target: target ?? '',
		anchor: anchor ?? '',
		tags: tags ?? [],
		data: data ?? '',
	};

	debugLog('info', 'ANS-104 Data Item:', JSON.stringify(dataItem, null, 2));

	return {
		headers: {
			'Content-Type': 'application/ans104',
			'codec-device': 'ans104@1.0',
		},
		item: dataItem,
	};
}
