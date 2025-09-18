import { ErrorCode, ValidationError } from './helpers/errors.ts';
import { validateJWK } from './helpers/security.ts';
import { DependenciesType } from './helpers/types.ts';
import { request } from './services/core.ts';
import { createSigner } from './signers/common.ts';

const DEFAULT_URL = 'https://forward.computer';

function init(deps: DependenciesType = {}) {
	validateDependencies(deps);

	const resolvedDeps = {
		url: DEFAULT_URL,
		...deps,
		signer: deps.signer ?? (deps.jwk ? createSigner(deps.jwk) : undefined),
	};

	return { request: request(resolvedDeps) };
}

export function validateDependencies(deps: DependenciesType): void {
	if (!deps) {
		throw new ValidationError(
			ErrorCode.VALIDATION_MISSING_DEPENDENCIES,
			'Dependencies object is required for SDK initialization',
			{ suggestion: 'Provide an object with optional jwk, signer, and url properties' },
		);
	}

	// Signer and JWK are optional — only validate JWK if present
	if (deps.jwk) {
		try {
			validateJWK(deps.jwk);
		} catch (err) {
			throw new ValidationError(ErrorCode.VALIDATION_INVALID_JWK, 'Provided JWK is invalid', { cause: err });
		}
	}
}

// @ts-ignore -- Aliased in build, dependent on platform
export { createSigner } from 'signers';

export default { init };
