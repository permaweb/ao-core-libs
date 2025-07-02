// Type augmentation for http-message-signatures library
declare module 'http-message-signatures' {
  export namespace httpbis {
    export function createSigningParameters(config: any): any;
    export function createSignatureBase(fields: any, request: any): any;
    export function formatSignatureBase(signatureBaseList: any): string;
    export function augmentHeaders(headers: any, signature: any, signatureInput: any, keyId: any): any;
  }
}