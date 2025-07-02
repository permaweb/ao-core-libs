import { httpbis } from 'http-message-signatures';
import { parseItem, serializeList } from 'structured-headers';

import {
	CreateFn,
	HttpRequest,
	HttpSignerArgs,
	POJO,
	SigningFormatType,
	SigBaseInput,
	SigBaseOutput,
	SignerType,
} from './types.ts';
import { debugLog, decodeBase64UrlToBytes, encodeBase64Url, hasNewline, isBytes, isPojo, sha256, toView } from './utils.ts';

const MAX_HEADER_LENGTH = 4096;

/* Encode a value into [type, encoded] tuple */
function hbEncodeValue(value: unknown): [string | undefined, string | Uint8Array | undefined] {
	if (isBytes(value)) {
		const bytes = new Uint8Array(
			(value as ArrayBufferView).buffer,
			(value as ArrayBufferView).byteOffset,
			(value as ArrayBufferView).byteLength,
		);
		if (bytes.byteLength === 0) return [undefined, ''];
		return [undefined, bytes];
	}
	if (typeof value === 'string') {
		if (value.length === 0) return [undefined, ''];
		return [undefined, value];
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return ['empty-list', undefined];
		const parts: string[] = [];
		for (const v of value) {
			let [t, enc] = hbEncodeValue(v);
			if (!t) t = 'binary';
			if (enc === undefined) continue;
			parts.push(`(ao-type-${t}) ${enc}`);
		}
		return ['list', parts.join(',')];
	}
	if (typeof value === 'number') {
		if (!Number.isInteger(value)) return ['float', value.toString()];
		return ['integer', value.toString()];
	}
	if (typeof value === 'symbol') {
		return ['atom', value.description ?? ''];
	}
	throw new Error(`Cannot encode value: ${String(value)}`);
}

/**
 * Lift and flatten nested fields for multipart encoding
 */
export function hbEncodeLift(obj: POJO, parent: string = '', top: POJO = {}): POJO {
	const [flatObj, typesObj] = Object.entries({ ...obj }).reduce(
		([flat, types], [key, val]) => {
			const flatKey = parent ? `${parent}/${key}`.toLowerCase() : key.toLowerCase();
			if (val == null) return [flat, types];
			let value = val;
			if (Array.isArray(value) && value.some(isPojo)) {
				// Convert array of POJOs to object by index
				value = value.reduce((acc, v, i) => ({ ...acc, [i]: v }), {} as POJO);
			}
			if (isPojo(value)) {
				hbEncodeLift(value, flatKey, top);
				return [flat, types];
			}
			const [type, encoded] = hbEncodeValue(value);
			if (encoded !== undefined) {
				const size = typeof encoded === 'string' ? Buffer.byteLength(encoded) : (encoded as Uint8Array).byteLength;
				if (size > MAX_HEADER_LENGTH) {
					top[flatKey] = encoded;
				} else {
					flat[key] = encoded;
				}
			}
			if (type) types[key] = type;
			return [flat, types];
		},
		[{} as POJO, {} as POJO],
	);

	if (Object.keys(flatObj).length === 0 && !parent) return top;

	// Attach ao-types header
	if (Object.keys(typesObj).length > 0) {
		const aoTypes = Object.entries(typesObj)
			.map(([k, v]) => `${k.toLowerCase()}=${v}`)
			.join(',');
		const aoSize = Buffer.byteLength(aoTypes);
		if (aoSize > MAX_HEADER_LENGTH) {
			const key = parent ? `${parent}/ao-types` : 'ao-types';
			top[key] = aoTypes;
		} else {
			flatObj['ao-types'] = aoTypes;
		}
	}

	if (parent) {
		top[parent] = flatObj;
	} else {
		Object.assign(top, flatObj);
	}
	return top;
}

/** Build a form-data part for name */
function encodePart(name: string, part: { headers: Headers; body?: Blob }): Blob {
	const hdrLines: (string | Blob)[] = [];
	part.headers.forEach((value, key) => {
		hdrLines.push(`${key}: ${value}\r\n`);
	});
	const content = [`content-disposition: form-data; name="${name}"\r\n`, ...hdrLines];
	if (part.body) content.push('\r\n', part.body);
	return new Blob(content);
}

export function httpSigName(address: string) {
	const decoded = decodeBase64UrlToBytes(address);
	const hexString = [...decoded.subarray(1, 9)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `http-sig-${hexString}`;
}

/**
 * Wrap any low‐level SignerType into an HTTP‐signature‐style signer.
 */
export function toHttpSigner(signer: SignerType) {
	// Always sign these params, sorted
	const params = ['alg', 'keyid'] as const;

	return async function ({ request, fields }: HttpSignerArgs): Promise<HttpRequest> {
		let unsignedBytes: Uint8Array;
		let createCalled = false;

		// We’ll stash these to build headers after signing
		const httpSig: {
			signatureInput?: string;
			signatureBase?: string;
		} = {};

		// This function is called by `signer` to get the exact bytes to sign
		const create: CreateFn = async (injected) => {
			createCalled = true;

			const { publicKey: rawPub, type = 1, alg = 'rsa-pss-sha512' } = injected;
			const publicKey = toView(rawPub);

			// Build the keyid + alg parameters
			const signingParameters = httpbis.createSigningParameters({
				params: [...params].sort(),
				paramValues: {
					keyid: encodeBase64Url(publicKey),
					alg,
				},
			} as any);

			// Build the (field → value) list
			const signatureBaseList = httpbis.createSignatureBase({ fields }, request as any);

			// Serialize “@signature-params” and append it
			const signatureInput = serializeList([[signatureBaseList.map(([item]) => parseItem(item)), signingParameters]]);
			signatureBaseList.push(['"@signature-params"', [signatureInput]]);

			// Turn it into the wire‐format string
			const base = httpbis.formatSignatureBase(signatureBaseList);
			httpSig.signatureInput = signatureInput;
			httpSig.signatureBase = base;

			// Encode to bytes & hand back for signing
			const encoded = new TextEncoder().encode(base);
			unsignedBytes = encoded;
			return encoded;
		};

		// Ask the low‐level signer to sign our bytes
		const { signature, address } = await signer(create, SigningFormatType.HTTP_SIG);

		if (!createCalled) {
			throw new Error('create() must be invoked to construct the data to sign');
		}
		if (!signature) {
			throw new Error('signer must return a `signature` property');
		}

		// Splice the signature into headers
		const rawSig = toView(signature);
		const sigB64 = encodeBase64Url(rawSig);
		const sigBuffer = Buffer.from(sigB64, 'base64url');
		const signedHeaders = httpbis.augmentHeaders(
			request.headers,
			sigBuffer,
			httpSig.signatureInput!,
			httpSigName(address),
		);

		// Return the signed request
		return {
			...request,
			headers: signedHeaders as any,
		};
	};
}

/**
 * Encode an object as HyperBEAM HTTP multipart
 */
export async function toHBRequest(obj: POJO = {}): Promise<{ headers: Headers; body?: Blob } | undefined> {
	if (Object.keys(obj).length === 0) return;
	const flattened = hbEncodeLift(obj);

	debugLog('info', 'Flattened HB Object', flattened);

	const headerKeys: string[] = [];
	const bodyKeys: string[] = [];

	await Promise.all(
		Object.entries(flattened).map(async ([key, value]) => {
			if (isPojo(value)) {
				const sub = await toHBRequest(value as POJO);
				if (!sub) return;
				bodyKeys.push(key);
				flattened[key] = encodePart(key, sub);
				return;
			}
			const valStr = String(value);
			const needsBody =
				(await hasNewline(value as any)) || key.includes('/') || Buffer.byteLength(valStr) > MAX_HEADER_LENGTH;
			if (needsBody) {
				bodyKeys.push(key);
				flattened[key] = new Blob([`content-disposition: form-data; name="${key}"\r\n\r\n`, valStr]);
			} else {
				headerKeys.push(key);
			}
		}),
	);

	const headers = new Headers();
	headerKeys.forEach((k) => {
		headers.append(k, String(flattened[k]));
	});

	let body: Blob | undefined;
	if (bodyKeys.length > 0) {
		if (bodyKeys.length === 1) {
			const single = new Blob([obj.data as Blob]);
			headers.append('inline-body-key', bodyKeys[0]);
			headers.delete(bodyKeys[0]);
			body = single;
		} else {
			// Multipart
			const partsBuffers = await Promise.all(bodyKeys.map((k) => (flattened[k] as Blob).arrayBuffer()));
			const base = new Blob(partsBuffers.flatMap((buf, i) => (i < partsBuffers.length - 1 ? [buf, '\r\n'] : [buf])));
			const hash = await sha256(await base.arrayBuffer());
			const boundary = encodeBase64Url(hash);

			const sections: (string | ArrayBuffer)[] = [];
			for (const buf of partsBuffers) {
				sections.push(`--${boundary}\r\n`, buf, '\r\n');
			}
			sections.push(`--${boundary}--`);

			headers.set('Content-Type', `multipart/form-data; boundary="${boundary}"`);
			body = new Blob(sections);
		}
		const finalBuf = await (body as Blob).arrayBuffer();
		const cdHash = await sha256(finalBuf);
		const cdB64 = encodeBase64Url(cdHash);
		headers.append('Content-Digest', `sha-256=:${cdB64}:`);
	}

	debugLog('info', 'To HB Request', { headers, body });

	return { headers, body };
}

/**
 * Build the list of signed fields and a normalized request payload.
 */
export function toSigBaseArgs({ url, method, headers, includePath = false }: SigBaseInput): SigBaseOutput {
	// Normalize headers into a Headers object, then into a plain record
	const hdr = new Headers(headers);
	const hdrRecord: Record<string, string> = {};
	for (const [key, value] of hdr) {
		hdrRecord[key] = value;
	}

	// Decide which “fields” get signed
	const fields = [...Object.keys(hdrRecord), ...(includePath ? ['@path'] : [])].sort();

	return {
		fields,
		request: {
			url,
			method,
			headers: hdrRecord,
		},
	};
}
