import { createData, DataItem, SIG_CONFIG } from '@dha-team/arbundles';

import { CreateInput, SigningFormatType } from './types.ts';
import { debugLog, encodeBase64Url, toView } from './utils.ts';

export function createDataItemBytes(data: any, signer: any, opts: any) {
	const signerMeta = (SIG_CONFIG as any)[signer.type];
	if (!signerMeta) throw new Error(`Metadata for signature type ${signer.type} not found`);

	signerMeta.signatureType = signer.type;
	signerMeta.ownerLength = signerMeta.pubLength;
	signerMeta.signatureLength = signerMeta.sigLength;
	signerMeta.publicKey = signer.publicKey;

	const dataItem = createData(data, signerMeta, opts);
	return dataItem.getRaw();
}

export async function getRawAndId(dataItemBytes: Uint8Array) {
	const dataItem = new DataItem(dataItemBytes as any);

	/**
	 * arbundles dataItem.id does not work in browser environments
	 * so we replicate it's behavior using impl that works
	 * on node and browser
	 */
	const rawSignature = dataItem.rawSignature;
	const rawId = await crypto.subtle.digest('SHA-256', rawSignature);

	return {
		id: encodeBase64Url(rawId),
		raw: dataItem.getRaw(),
	};
}

export function getSignatureData(dataItemBytes: Uint8Array) {
	const dataItem = new DataItem(dataItemBytes as any);
	return dataItem.getSignatureData();
}

export function verify(dataItemBytes: Uint8Array) {
	return DataItem.verify(dataItemBytes as any);
}

export function toDataItemSigner(signer: any) {
	return async function ({ data, tags, target, anchor }: any) {
		let unsignedBytes: any = null;
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
			unsignedBytes = createDataItemBytes(data, { type, publicKey: toView(publicKey) }, { target, tags, anchor });

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
			throw new Error('create() must be invoked to construct the data to sign');
		}

		// If the signer already returned a full DataItem, just pass it through
		if (res && typeof res === 'object' && res.id && res.raw) {
			return res;
		}

		// Otherwise, expect a signature blob
		if (!res.signature) {
			throw new Error('signer must return a `signature` property');
		}
		const rawSig = toView(res.signature);

		// Splice the raw signature into the unsigned bytes
		const signedBytes = new Uint8Array(unsignedBytes);
		signedBytes.set(rawSig as any, 2);

		// Verify it before returning
		const isValid = await verify(signedBytes);
		if (!isValid) {
			throw new Error('Data Item signature is not valid');
		}

		// Compute the DataItem ID = base64url( SHA-256(rawSig) )
		const hashBuffer = await crypto.subtle.digest('SHA-256', rawSig as any);
		const id = encodeBase64Url(hashBuffer);

		return { id, raw: signedBytes };
	};
}

export function toANS104Request(fields: any) {
	if (!fields) throw new Error('Expected Fields');

	const { target = '', anchor = '', data = '', Type, Variant, ...rest } = fields;

	const excludeList = ['target', 'anchor', 'data', 'data-protocol', 'variant', 'dryrun', 'type', 'path', 'method'];

	const exclude = new Set(excludeList);

	const dynamicTags = Object.entries(rest)
		.filter(([key]) => !exclude.has(key.toLowerCase()))
		.map(([name, value]) => ({
			name,
			value: String(value),
		}));

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
