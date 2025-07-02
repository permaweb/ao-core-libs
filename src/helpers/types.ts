import { KeyObject } from 'crypto';

/* SDK Dependencies */
export type DependenciesType = {
	jwk?: JWK;
	signer?: SignerType;
	url?: string;
};

/* Arguments accepted by the request function */
export type RequestType = {
	path: string;
} & any;

/* HTTP Method used in Request */
export type RequestMethodType = 'GET' | 'POST';

/* Signing Formats */
export enum SigningFormatType {
	ANS_104 = 'ans104',
	HTTP_SIG = 'httpsig',
}

/* Minimal Request shape for HTTP signing */
export interface HttpRequest {
	url?: string;
	method?: string;
	headers: Record<string, string>;
	body: any;
}

/* What we hand to the signer: the request plus the list of header-fields to sign */
export interface HttpSignerArgs {
	request: HttpRequest;
	fields: string[];
}

/* Minimal JWK interface */
export interface JWK {
	kty: string;
	n: string;
	e: string;
	d?: string;
	[key: string]: any;
}

/* Options passed to our two signer‐builders */
export interface SignerOptions {
	privateKey: KeyObject;
	publicKey: Buffer;
	address: string;
}

/*
 * If `passthrough` is true, `create` can return this shape
 * instead of a deepHash Uint8Array
 */
export interface CreateOutput {
	data: Buffer;
	tags: any[];
	target?: string;
	anchor?: string;
}

/* What the `create(...)` function receives when the signer calls it */
export interface CreateInput {
	type: number;
	publicKey: Buffer;
	alg: string;
	passthrough?: boolean;
}

/*
 * The function that we hand to `signer(...)` to produce
 * either a deepHash (Uint8Array) or a passthrough payload
 */
export type CreateFn = (injected: CreateInput) => Promise<Uint8Array | CreateOutput>;

/* What each of our signers returns */
export interface SignatureResult {
	signature: Buffer;
	address: string;
}

/* The final signer type returned by `createSigner` */
export type SignerType = (create: CreateFn, kind: SigningFormatType) => Promise<SignatureResult>;

/*
 * What you pass in to build the signature base.
 */
export interface SigBaseInput {
	url: string;
	method: string;
	headers: HeadersInit;
	/* Whether to include the path (`'@path'`) among the signed fields. Defaults to `false`. */
	includePath?: boolean;
}

/*
 * What you get back:
 * - `fields`: the sorted list of header names (plus optional `@path`)
 * - `request`: the minimal request object you’ll actually sign
 */
export interface SigBaseOutput {
	fields: string[];
	request: {
		url: string;
		method: string;
		headers: Record<string, string>;
	};
}

/* Basic Log Levels identified by process.env.DEBUG */
export type DebugLogType = 'info' | 'warn' | 'error';

/* For a plain object detector used by http-sig */
export type POJO = { [key: string]: any };
