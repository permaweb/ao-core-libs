import { request } from 'services/core.ts';

import { createSigner } from 'helpers/signer.ts';
import { DependenciesType, SignerType } from 'helpers/types.ts';

function init(deps: DependenciesType) {
	const validationError = getValidationError(deps);
	if (validationError) throw new Error(validationError);

	/* Create the signer if only a wallet is passed */
	if (!deps.signer && deps.jwk) {
		deps = { ...deps, signer: createSigner(deps.jwk) };
	} else {
		throw new Error('No Signer or JWK provided');
	}

	return {
		request: request(deps),
	};
}

export function getValidationError(deps: DependenciesType): string | null {
	if (!deps) return 'Expected Dependencies';
	if (!deps.jwk && !deps.signer) return 'Expected JWK or SignerType';

	return null;
}

export default { init };
