let hasNodeBuffer = false;
let NodeBuffer: typeof Buffer;
try {
	// @ts-ignore
	NodeBuffer = require('buffer').Buffer;
	hasNodeBuffer = true;
} catch {}

import { DebugLogType, DependenciesType, POJO, RequestType } from './types';

const raw = process.env.DEBUG ?? '';
const enabled = new Set(raw.split(',').map((s) => s.trim()));

export function debugLog(level: DebugLogType, ...args: unknown[]) {
	if (!(enabled.has(level) || enabled.has('*'))) return;

	let prefix = `[${level.toUpperCase()}]`;
	switch (level) {
		case 'info':
			prefix = `\x1b[36m${prefix}\x1b[0m`;
			break;
		case 'warn':
			prefix = `\x1b[33m${prefix}\x1b[0m`;
			break;
		case 'error':
			prefix = `\x1b[31m${prefix}\x1b[0m`;
			break;
	}

	console.log(prefix, ...args);
}

export function buildPath(args: { process?: string; device?: string; path: string }): string {
	const clean = args.path.replace(/^\/+/, '');

	let result = '';
	if (args.process) {
		result += `/${args.process}~`;
		result += args.device ?? 'process@1.0';
	}
	result += `/${clean}`;
	return result;
}

export function joinURL(args: { url: string; path: string }) {
	if (!args.path) return args.url;
	if (args.path.startsWith('/')) return joinURL({ url: args.url, path: args.path.slice(1) });
	args.url = new URL(args.url);
	args.url.pathname += args.path;
	return args.url.toString();
}

export function encodeBase64Url(input: Uint8Array | ArrayBuffer): string {
	// Get a Uint8Array
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

	// Convert to standard base64
	let b64 = btoa(String.fromCharCode(...bytes));

	// Make it 'URL safe'
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64UrlToBytes(b64url: string): Uint8Array {
	// 1. Pad to multiple of 4
	const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
	// 2. Standardize chars
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
	// 3. Decode
	const bin =
		typeof atob === 'function'
			? atob(b64)
			: hasNodeBuffer
				? NodeBuffer.from(b64, 'base64').toString('binary')
				: (() => {
						throw new Error('No base64 decoder!');
					})();
	// 4. Map to bytes
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

/**
 * Convert a base64url‐encoded *string* or a Uint8Array/ArrayBufferView
 * into a Uint8Array of raw bytes.
 */
export function toView(value: string | ArrayBufferView | Buffer): Uint8Array {
	if (Buffer.isBuffer(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}
	
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}

	if (typeof value === 'string') {
		return decodeBase64UrlToBytes(value);
	}

	throw new Error('Unexpected type in toView(); expected string, Buffer, or Uint8Array');
}

/** Helper to detect byte arrays */
export function isBytes(value: unknown): value is ArrayBufferView | ArrayBuffer | Buffer {
	return value instanceof ArrayBuffer || ArrayBuffer.isView(value) || Buffer.isBuffer(value);
}

/** Helper to detect plain objects */
export function isPojo(value: unknown): value is POJO {
	return (
		!isBytes(value) && !Array.isArray(value) && !(value instanceof Blob) && typeof value === 'object' && value !== null
	);
}

/** Check for newline in string, Blob, or bytes */
export async function hasNewline(value: string | Blob | ArrayBufferView | ArrayBuffer): Promise<boolean> {
	if (typeof value === 'string') return value.includes('\n');
	if (value instanceof Blob) {
		const text = await value.text();
		return text.includes('\n');
	}
	if (isBytes(value)) {
		const bytes = new Uint8Array(
			(value as ArrayBufferView).buffer,
			(value as ArrayBufferView).byteOffset,
			(value as ArrayBufferView).byteLength,
		);
		return bytes.includes('\n'.charCodeAt(0));
	}
	return false;
}

/** SHA-256 digest */
export async function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', data);
}
