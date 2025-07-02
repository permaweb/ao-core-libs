import { request } from './services/core';
import { createSigner } from './helpers/signer';
import { DependenciesType } from './helpers/types';
import { ValidationError, ErrorCode } from './helpers/errors';

const DEFAULT_URL = 'https://forward.computer';

function init(deps: DependenciesType) {
	validateDependencies(deps);
	
	if (!deps.signer && deps.jwk) deps = { ...deps, signer: createSigner(deps.jwk) };
	if (!deps.url) deps = { ...deps, url: DEFAULT_URL };

	return {
		request: request(deps),
	};
}

export function validateDependencies(deps: DependenciesType): void {
	if (!deps) {
		throw new ValidationError(
			ErrorCode.VALIDATION_MISSING_DEPENDENCIES,
			'Dependencies object is required for SDK initialization',
			{ suggestion: 'Provide an object with either jwk or signer property' }
		);
	}
	if (!deps.jwk && !deps.signer) {
		throw new ValidationError(
			ErrorCode.VALIDATION_MISSING_JWK_OR_SIGNER,
			'Either JWK wallet or custom signer must be provided',
			{ 
				provided: Object.keys(deps),
				suggestion: 'Add jwk property with your Arweave wallet or signer property with custom signer'
			}
		);
	}
}

// Legacy function for backward compatibility
export function getValidationError(deps: DependenciesType): string | null {
	try {
		validateDependencies(deps);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Validation failed';
	}
}

export default { init, getValidationError };
