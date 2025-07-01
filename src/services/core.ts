import { toANS104Request, toDataItemSigner } from 'helpers/data-item.ts';
import { toHBRequest, toHttpSigner, toSigBaseArgs } from 'helpers/http-sig.ts';
import { DependenciesType, RequestFormatType, RequestType } from 'helpers/types.ts';
import { buildPath, debugLog, joinURL } from 'helpers/utils.ts';

const DEFAULT_URL = 'https://forward.computer';

export function request(deps: DependenciesType) {
	return async (args: RequestType): Promise<Response> => {
		const validationError = getValidationError(args);
		if (validationError) throw new Error(validationError);

		const requestURL = joinURL({
			url: args.url ?? deps.url ?? DEFAULT_URL,
			path: buildPath({
				process: args.process,
				device: args.device,
				path: args.path,
			}),
		});

		debugLog('info', 'Request URL:', requestURL);

		let unsignedRequest = null;
		let signedRequest = null;
		let httpRequest = null;

		try {
			debugLog('info', 'Signing Format:', args.format);

			switch (args.format) {
				case RequestFormatType.ANS_104:
					unsignedRequest = toANS104Request(args.fields);
					signedRequest = await toDataItemSigner(deps.signer)(unsignedRequest.item);
					break;
				case RequestFormatType.HTTP_SIG:
					unsignedRequest = await toHBRequest(args.fields);

					if (unsignedRequest) {
						const signingArgs = toSigBaseArgs({
							url: requestURL,
							method: args.method,
							headers: unsignedRequest.headers,
						});

						signedRequest = await toHttpSigner(deps.signer!)(signingArgs);
						break;
					} else {
						throw new Error('Error preparing HB Request');
					}
			}

			debugLog('info', 'Unsigned Request', JSON.stringify(unsignedRequest, null, 2));
			debugLog('info', 'Signed Request', signedRequest);
		} catch (e: any) {
			throw new Error(e ?? 'Error Formatting Request');
		}

		httpRequest = {
			url: requestURL,
			method: args.method,
			headers: unsignedRequest.headers,
			body: signedRequest.raw,
			redirect: 'follow',
		};

		try {
			const response = await fetch(httpRequest.url, {
				method: httpRequest.method,
				headers: httpRequest.headers,
				body: httpRequest.body,
				redirect: 'follow',
			});

			if (!response.ok) debugLog('error', 'HTTP Response:', response);

			return response;
		} catch (e: any) {
			throw new Error(e.message ?? 'Error sending HTTP Request');
		}
	};
}

export function getValidationError(args: RequestType): string | null {
	if (!args) return 'Expected Request Args';

	if (!args.method) return 'Method Expected';
	if (!args.path) return 'Path Expected';
	if (!args.format) return 'Format Expected';

	const validFormats = Object.values(RequestFormatType);
	if (!validFormats.includes(args.format)) return 'Invalid Format Provided';

	return null;
}
