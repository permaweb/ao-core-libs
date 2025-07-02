import { toANS104Request, toDataItemSigner } from '../helpers/data-item';
import { toHBRequest, toHttpSigner, toSigBaseArgs } from '../helpers/http-sig';
import { DependenciesType, HttpRequest, RequestFormatType, RequestType } from '../helpers/types';
import { debugLog, joinURL } from '../helpers/utils';
import { ValidationError, RequestError, ErrorCode } from '../helpers/errors';

/** Simple request cache with TTL */
class RequestCache {
	private cache = new Map<string, { response: Response; timestamp: number }>();
	private readonly ttlMs: number;
	private readonly maxSize: number;

	constructor(ttlMs: number = 30000, maxSize: number = 50) {
		this.ttlMs = ttlMs;
		this.maxSize = maxSize;
	}

	private getKey(url: string, method: string, body?: BodyInit): string {
		// Create cache key from URL, method, and body hash
		const bodyStr = body ? (typeof body === 'string' ? body : body.toString()) : '';
		return `${method}:${url}:${bodyStr.length}:${bodyStr.slice(0, 100)}`;
	}

	get(url: string, method: string, body?: BodyInit): Response | null {
		const key = this.getKey(url, method, body);
		const entry = this.cache.get(key);
		
		if (!entry) return null;
		
		// Check if expired
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key);
			return null;
		}
		
		// Clone response to avoid issues with consumed streams
		return entry.response.clone();
	}

	set(url: string, method: string, response: Response, body?: BodyInit): void {
		// Only cache successful GET requests to avoid side effects
		if (method !== 'GET' || !response.ok) return;
		
		const key = this.getKey(url, method, body);
		
		// Remove oldest entry if cache is full
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}
		
		// Store cloned response to avoid stream consumption issues
		this.cache.set(key, {
			response: response.clone(),
			timestamp: Date.now()
		});
	}
}

// Global request cache instance
const requestCache = new RequestCache();

export function request(deps: DependenciesType) {
	return async (args: RequestType): Promise<Response> => {
		validateRequest(args);

		const requestURL = joinURL({ url: deps.url, path: args.path });
		const requestMethod = args.method ?? 'GET';

		debugLog('info', 'Request URL:', requestURL);

		// Check cache for GET requests
		if (requestMethod === 'GET') {
			const cachedResponse = requestCache.get(requestURL, requestMethod);
			if (cachedResponse) {
				debugLog('info', 'Cache hit for request:', requestURL);
				return cachedResponse;
			}
		}

		let unsignedRequest = null;
		let signedRequest = null;
		let httpRequest: HttpRequest | null = null;

		 const { path, method, ...remainingFields } = args;

		const signingFormat = args.signingFormat ?? RequestFormatType.HTTP_SIG;

		try {
			debugLog('info', 'Signing Format:', signingFormat);

			switch (signingFormat) {
				case RequestFormatType.ANS_104:
					unsignedRequest = toANS104Request(remainingFields);
					signedRequest = await toDataItemSigner(deps.signer)(unsignedRequest.item);

					httpRequest = {
						headers: unsignedRequest.headers,
						body: signedRequest.raw
					}

					break;
				case RequestFormatType.HTTP_SIG:
					unsignedRequest = await toHBRequest(remainingFields);

					if (unsignedRequest && deps.signer) {
						const signingArgs = toSigBaseArgs({
							url: requestURL,
							method: requestMethod,
							headers: unsignedRequest.headers,
						});

						signedRequest = await toHttpSigner(deps.signer!)(signingArgs);

						httpRequest = { ...signedRequest };

						break;
					} else {
						throw new RequestError(
							ErrorCode.REQUEST_PREPARATION_FAILED,
							'Error preparing HTTP-SIG request',
							{ 
								signingFormat,
								suggestion: 'Check signer configuration and request parameters' 
							}
						);
					}
			}
		} catch (e: unknown) {
			throw new RequestError(
				ErrorCode.REQUEST_FORMATTING_FAILED,
				'Failed to format request for signing',
				{ signingFormat, path: args.path },
				e instanceof Error ? e : undefined
			);
		}

		if (!unsignedRequest || !signedRequest || !httpRequest) {
			throw new RequestError(
				ErrorCode.REQUEST_PREPARATION_FAILED,
				'Request preparation incomplete - missing required components',
				{
					unsignedRequest: !!unsignedRequest,
					signedRequest: !!signedRequest,
					httpRequest: !!httpRequest,
					suggestion: 'Check signer configuration and request parameters'
				}
			);
		}
		
		debugLog('info', 'Signed Request', signedRequest);
		debugLog('info', 'HTTP Request', httpRequest);

		try {
			const response = await fetch(requestURL, {
				method: requestMethod,
				headers: httpRequest.headers,
				body: httpRequest.body,
				redirect: 'follow',
			});

			if (!response.ok) {
				debugLog('error', 'HTTP Response:', response)
				debugLog('error', 'HTTP Response Body:', await response.text());
			};

			// Cache successful responses
			requestCache.set(requestURL, requestMethod, response, httpRequest.body);

			return response;
		} catch (e: unknown) {
			throw new RequestError(
				ErrorCode.REQUEST_HTTP_FAILED,
				'HTTP request failed',
				{ url: requestURL, method: requestMethod },
				e instanceof Error ? e : undefined
			);
		}
	};
}

export function validateRequest(args: RequestType): void {
	if (!args) {
		throw new ValidationError(
			ErrorCode.VALIDATION_MISSING_PATH,
			'Request arguments object is required',
			{ suggestion: 'Provide an object with at least a path property' }
		);
	}

	if (!args.path) {
		throw new ValidationError(
			ErrorCode.VALIDATION_MISSING_PATH,
			'Path is required for all requests',
			{ 
				provided: Object.keys(args),
				suggestion: 'Add path property with the API endpoint path'
			}
		);
	}

	const validFormats = Object.values(RequestFormatType);
	if (args.signingFormat && !validFormats.includes(args.signingFormat)) {
		throw new ValidationError(
			ErrorCode.VALIDATION_INVALID_FORMAT,
			`Invalid signing format: ${args.signingFormat}`,
			{
				provided: args.signingFormat,
				validFormats,
				suggestion: `Use one of: ${validFormats.join(', ')}`
			}
		);
	}
}

// Legacy function for backward compatibility
export function getValidationError(args: RequestType): string | null {
	try {
		validateRequest(args);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Validation failed';
	}
}
