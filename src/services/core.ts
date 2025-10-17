import { toANS104Request, toDataItemSigner } from '../helpers/data-item.ts';
import { ErrorCode, RequestError, ValidationError } from '../helpers/errors.ts';
import { toHBRequest, toHttpSigner, toSigBaseArgs, verifySig } from '../helpers/http-sig.ts';
import { DependenciesType, HttpRequest, RequestType, SigningFormatType } from '../helpers/types.ts';
import { debugLog, joinURL } from '../helpers/utils.ts';
import { Response as HttpSigResponse, Request as HttpSigRequest } from 'http-message-signatures/lib/types/index.js';

export function request(deps: DependenciesType) {
	return async (args: RequestType): Promise<Response> => {
		validateRequest(args);

		const signingFormat = args['signing-format'] ?? SigningFormatType.HTTP_SIG;
		const requestURL = joinURL({ url: deps.url!, path: args.path });

		/* GET Requests do not allow for a body, while ANS-104 uses the data item as the body */
		const requestMethod = signingFormat === SigningFormatType.ANS_104 ? 'POST' : (args.method ?? 'GET');

		const { path, method, ...remainingFields } = args;

		/* Ensure the signing format is present on remaining fields if not passed in args */
		if (!remainingFields['signing-format']) remainingFields['signing-format'] = signingFormat;

		debugLog('info', 'Request URL:', requestURL);
		debugLog('info', 'Signing Format:', signingFormat);

		let unsignedRequest = null;
		let signedRequest = null;
		let httpRequest: HttpRequest | null = null;

		try {
			switch (signingFormat) {
				case SigningFormatType.ANS_104:
					unsignedRequest = toANS104Request(remainingFields);

					const body = deps.signer
						? (await toDataItemSigner(deps.signer)(unsignedRequest.item)).raw
						: unsignedRequest.item;

					httpRequest = { headers: unsignedRequest.headers, body };

					break;
				case SigningFormatType.HTTP_SIG:
					unsignedRequest = await toHBRequest(remainingFields);

					if (!unsignedRequest) {
						throw new RequestError(ErrorCode.REQUEST_PREPARATION_FAILED, 'Error preparing HTTP-SIG request', {
							signingFormat,
							suggestion: 'Check request parameters',
						});
					}

					if (deps.signer) {
						const signingArgs = toSigBaseArgs({
							url: requestURL,
							method: requestMethod,
							headers: unsignedRequest.headers,
						});

						const signedRequest = await toHttpSigner(deps.signer)(signingArgs);
						if (!verifySig(signedRequest as HttpSigRequest)) {
							throw new Error('Invalid httpsig request')
						}
						httpRequest = { ...signedRequest };
					} else {
						httpRequest = {
							headers: unsignedRequest.headers as any,
							body: unsignedRequest.body,
						};
					}

					break;
			}
		} catch (e: unknown) {
			throw new RequestError(
				ErrorCode.REQUEST_FORMATTING_FAILED,
				'Failed to format request for signing',
				{ signingFormat, path: args.path },
				e instanceof Error ? e : undefined,
			);
		}

		if (signedRequest) debugLog('info', 'Signed Request', signedRequest);
		debugLog('info', 'HTTP Request', httpRequest);

		try {
			const httpRequestArgs: any = {
				method: requestMethod,
				headers: httpRequest.headers,
				redirect: 'follow',
			};

			if (requestMethod !== 'GET') httpRequestArgs.body = httpRequest.body;

			const response = await fetch(requestURL, httpRequestArgs);

			// Checks whether the response is valid httpsig
			const isHttpSigResponse = response.headers.get('signature') && response.headers.get('signature-input')
			if (isHttpSigResponse) {
				const res = {
					headers: headersToRecords(response.headers),
					status: response.status
				} as HttpSigResponse
				try {
					const validSig = await verifySig(res)
					if (!validSig) {
						throw new Error('Invalid httpsig response')
					}
				}
				catch(e) {
					console.log('Invalid httpsig response')
					console.log('req', httpRequestArgs)
					console.log('res', response)
					throw e
				}
			}

			const bodyText = await response
				.clone()
				.text()
				.catch((e) => {
					debugLog('error', 'Failed to read cloned body as text', e);
					return `Error reading body: ${e.message}`;
				});
			debugLog(response.ok ? 'info' : 'error', 'HTTP Response:', {
				status: response.status,
				url: response.url,
				body: bodyText,
			});

			return response;
		} catch (e: unknown) {
			throw new RequestError(
				ErrorCode.REQUEST_HTTP_FAILED,
				'HTTP request failed',
				{ url: requestURL, method: requestMethod },
				e instanceof Error ? e : undefined,
			);
		}
	};
}

function headersToRecords(headers: Headers) {
	return Array.from(headers.entries()).reduce((acc, [key, value]) => {
		if (acc[key]) {
		acc[key] = Array.isArray(acc[key])
			? [...acc[key], value]
			: [acc[key] as string, value];
		} else {
			acc[key] = value;
		}
		return acc;
	}, {} as Record<string, string | string[]>);
}

export function validateRequest(args: RequestType): void {
	if (!args) {
		throw new ValidationError(ErrorCode.VALIDATION_MISSING_PATH, 'Request arguments object is required', {
			suggestion: 'Provide an object with at least a path property',
		});
	}

	if (!args.path) {
		throw new ValidationError(ErrorCode.VALIDATION_MISSING_PATH, 'Path is required for all requests', {
			provided: Object.keys(args),
			suggestion: 'Add path property with the API endpoint path',
		});
	}

	const validFormats = Object.values(SigningFormatType);
	if (args['signing-format'] && !validFormats.includes(args['signing-format'])) {
		throw new ValidationError(
			ErrorCode.VALIDATION_INVALID_FORMAT,
			`Invalid signing format: ${args['signing-format']}`,
			{
				provided: args['signing-format'],
				validFormats,
				suggestion: `Use one of: ${validFormats.join(', ')}`,
			},
		);
	}
}
