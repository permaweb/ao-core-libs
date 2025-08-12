import { toANS104Request, toDataItemSigner } from '../helpers/data-item.ts';
import { ErrorCode, RequestError, ValidationError } from '../helpers/errors.ts';
import { toHBRequest, toHttpSigner, toSigBaseArgs } from '../helpers/http-sig.ts';
import { DependenciesType, HttpRequest, RequestType, SigningFormatType } from '../helpers/types.ts';
import { debugLog, joinURL } from '../helpers/utils.ts';

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
					signedRequest = await toDataItemSigner(deps.signer!)(unsignedRequest.item);

					httpRequest = {
						headers: unsignedRequest.headers,
						body: signedRequest.raw,
					};

					break;
				case SigningFormatType.HTTP_SIG:
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
						throw new RequestError(ErrorCode.REQUEST_PREPARATION_FAILED, 'Error preparing HTTP-SIG request', {
							signingFormat,
							suggestion: 'Check signer configuration and request parameters',
						});
					}
			}
		} catch (e: unknown) {
			throw new RequestError(
				ErrorCode.REQUEST_FORMATTING_FAILED,
				'Failed to format request for signing',
				{ signingFormat, path: args.path },
				e instanceof Error ? e : undefined,
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
					suggestion: 'Check signer configuration and request parameters',
				},
			);
		}

		debugLog('info', 'Signed Request', signedRequest);
		debugLog('info', 'HTTP Request', httpRequest);

		try {
			const httpRequestArgs: any = {
				method: requestMethod,
				headers: httpRequest.headers,
				redirect: 'follow',
			};

			if (requestMethod !== 'GET') httpRequestArgs.body = httpRequest.body;

			const response = await fetch(requestURL, httpRequestArgs);

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
