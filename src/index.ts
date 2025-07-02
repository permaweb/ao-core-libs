import { request } from 'services/core.ts';
import { createSigner } from 'signers/common.ts';

import { DependenciesType } from 'helpers/types.ts';

const DEFAULT_URL = 'https://forward.computer';

export function init(deps: DependenciesType) {
	const validationError = getValidationError(deps);
	if (validationError) throw new Error(validationError);

	if (!deps.signer && deps.jwk) deps = { ...deps, signer: createSigner(deps.jwk) };
	if (!deps.url) deps = { ...deps, url: DEFAULT_URL };

	return {
		request: request(deps),
	};
}

function getValidationError(deps: DependenciesType): string | null {
	if (!deps) return 'Expected Dependencies';
	if (!deps.jwk && !deps.signer) return 'Expected JWK or SignerType';

	return null;
}

// @ts-ignore -- Aliased in build, dependent on platform
export { createSigner } from 'signers';

export default { init };
