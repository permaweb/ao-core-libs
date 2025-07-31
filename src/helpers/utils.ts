let hasNodeBuffer = false;
let NodeBuffer: typeof Buffer;
try {
	// @ts-ignore
	NodeBuffer = require('buffer').Buffer;
	hasNodeBuffer = true;
} catch {}

// Import Buffer shim for compatibility with ao/connect
let BufferShim: typeof Buffer;
try {
	// @ts-ignore
	BufferShim = require('buffer/index.js').Buffer;
	if (!globalThis.Buffer) globalThis.Buffer = BufferShim;
} catch {}

// Import base64url for compatibility
let base64url: any;
try {
	// @ts-ignore
	base64url = require('base64url');
} catch {}

import { EncodingError, ErrorCode } from './errors.ts';
import { DebugLogType, POJO } from './types.ts';

const raw = process.env.DEBUG ?? '';
const enabled = new Set(raw.split(',').map((s) => s.trim()));

export function debugLog(level: DebugLogType, ...args: unknown[]) {
	if (!(enabled.has(level) || enabled.has('*'))) return;

	let prefix = `[@permaweb/ao-core-libs - ${level.toUpperCase()}]`;
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
	(args.url as any) = new URL(args.url);
	(args.url as any).pathname += args.path;
	return args.url.toString();
}

export function encodeBase64Url(input: Uint8Array | ArrayBuffer): string {
	// Get a Uint8Array
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

	// Convert to standard base64 - handle large arrays in chunks to avoid stack overflow
	let b64: string;
	if (bytes.length > 32768) {
		// For large arrays, process in chunks to avoid call stack overflow
		const chunks: string[] = [];
		for (let i = 0; i < bytes.length; i += 32768) {
			const chunk = bytes.slice(i, i + 32768);
			chunks.push(String.fromCharCode(...chunk));
		}
		b64 = btoa(chunks.join(''));
	} else {
		// For smaller arrays, use direct conversion
		b64 = btoa(String.fromCharCode(...bytes));
	}

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
						throw new EncodingError(ErrorCode.ENCODING_NO_DECODER, 'No base64 decoder available in this environment', {
							environment: typeof window !== 'undefined' ? 'browser' : 'node',
							suggestion: 'Ensure Buffer is available or use a base64 polyfill',
						});
					})();
	// 4. Map to bytes - optimized conversion
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Convert a base64url‐encoded *string* or a Uint8Array/ArrayBufferView
 * into a Uint8Array of raw bytes.
 */
// export function toView(value: string | ArrayBufferView | Buffer): Uint8Array {
// 	if (Buffer.isBuffer(value)) {
// 		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
// 	}

// 	if (ArrayBuffer.isView(value)) {
// 		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
// 	}

// 	if (typeof value === 'string') {
// 		return decodeBase64UrlToBytes(value);
// 	}

// 	throw new EncodingError(ErrorCode.ENCODING_UNSUPPORTED_INPUT_TYPE, 'Unsupported input type for toView conversion', {
// 		provided: typeof value,
// 		supportedTypes: ['string', 'Buffer', 'Uint8Array', 'ArrayBufferView'],
// 		suggestion: 'Convert input to string (base64url) or byte array format',
// 	});
// }

export const toView = (value: any) => {
	if (ArrayBuffer.isView(value)) value = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	else if (typeof value === 'string') value = base64url.toBuffer(value);
	else throw new Error('Unexpected type. Value must be one of Uint8Array, ArrayBuffer, or base64url-encoded string');
	return value;
};

/**
 * Convert value to Buffer (ao/connect compatible version)
 * This matches the exact behavior of ao/connect's toView function
 */
export function toViewBuffer(value: string | ArrayBufferView | Buffer): Buffer {
	if (ArrayBuffer.isView(value)) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	if (typeof value === 'string') {
		if (base64url && base64url.toBuffer) {
			return base64url.toBuffer(value);
		}
		// Fallback to manual conversion
		const bytes = decodeBase64UrlToBytes(value);
		return Buffer.from(bytes);
	}
	throw new Error('Unexpected type. Value must be one of Uint8Array, ArrayBuffer, or base64url-encoded string');
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

/** Simple LRU cache for hash results */
class HashCache {
	private cache = new Map<string, ArrayBuffer>();
	private maxSize = 100; // Limit cache size

	private getKey(data: ArrayBuffer | Uint8Array): string {
		// Create a simple key from the first and last few bytes + length
		const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
		if (bytes.length <= 16) {
			return Array.from(bytes).join(',');
		}
		// For larger arrays, use first 8 + last 8 bytes + length as key
		const key =
			Array.from(bytes.slice(0, 8)).join(',') + '|' + Array.from(bytes.slice(-8)).join(',') + '|' + bytes.length;
		return key;
	}

	get(data: ArrayBuffer | Uint8Array): ArrayBuffer | undefined {
		const key = this.getKey(data);
		const result = this.cache.get(key);
		if (result) {
			// Move to end (most recently used)
			this.cache.delete(key);
			this.cache.set(key, result);
		}
		return result;
	}

	set(data: ArrayBuffer | Uint8Array, hash: ArrayBuffer): void {
		const key = this.getKey(data);

		// Remove oldest entry if cache is full
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey as any);
		}

		// Store the hash result
		this.cache.set(key, hash.slice()); // Clone the buffer
	}
}

// Global hash cache instance
const hashCache = new HashCache();

/** SHA-256 digest with caching */
export async function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
	// Check cache first
	const cached = hashCache.get(data);
	if (cached) {
		return cached.slice(); // Return a copy
	}

	// Compute hash
	const hash = await crypto.subtle.digest('SHA-256', data);

	// Cache the result
	hashCache.set(data, hash);

	return hash;
}
