import { toANS104Request, toDataItemSigner } from 'helpers/data-item.ts';
import { toHBRequest, toHttpSigner, toSigBaseArgs } from 'helpers/http-sig.ts';
import { DependenciesType, HttpRequest, RequestType,SigningFormatType } from 'helpers/types.ts';
import { debugLog, joinURL } from 'helpers/utils.ts';

export function request(deps: DependenciesType) {
	return async (args: RequestType): Promise<Response> => {
		const validationError = getValidationError(args);
		if (validationError) throw new Error(validationError);

		const requestURL = joinURL({ url: deps.url, path: args.path });

		debugLog('info', 'Request URL:', requestURL);

		let unsignedRequest = null;
		let signedRequest = null;
		let httpRequest: HttpRequest | null = null;

		 const { path, method, ...remainingFields } = args;

		const requestMethod = method ?? 'GET';
		const signingFormat = args.signingFormat ?? SigningFormatType.HTTP_SIG;

		try {
			debugLog('info', 'Signing Format:', signingFormat);

			switch (signingFormat) {
				case SigningFormatType.ANS_104:
					unsignedRequest = toANS104Request(remainingFields);
					signedRequest = await toDataItemSigner(deps.signer)(unsignedRequest.item);

					httpRequest = {
						headers: unsignedRequest.headers,
						body: signedRequest.raw
					}

					break;
				case SigningFormatType.HTTP_SIG:
					unsignedRequest = await toHBRequest(remainingFields);

					if (unsignedRequest && deps.signer) {
						const signingArgs = toSigBaseArgs({
							url: requestURL,
							method: requestMethod,
							headers: unsignedRequest.headers,
						});

						signedRequest = await toHttpSigner(deps.signer)(signingArgs as any);

						httpRequest = { ...signedRequest };

						break;
					} else {
						throw new Error('Error preparing request');
					}
			}
		} catch (e: any) {
			throw new Error(e ?? 'Error formatting request');
		}

		if (!unsignedRequest || !signedRequest || !httpRequest) throw new Error('Error preparing request');
		
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

			return response;
		} catch (e: any) {
			throw new Error(e.message ?? 'Error sending HTTP Request');
		}
	};
}

function getValidationError(args: RequestType): string | null {
	if (!args) return 'Expected Request Args';

	if (!args.path) return 'Path Expected';

	const validFormats = Object.values(SigningFormatType);
	if (args.signingFormat && !validFormats.includes(args.signingFormat)) return 'Invalid Format Provided';

	return null;
}
