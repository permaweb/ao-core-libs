// Type augmentation for @dha-team/arbundles library
declare module '@dha-team/arbundles' {
  export interface DataItemCreateOptions {
    target?: string;
    anchor?: string;
    tags?: Array<{ name: string; value: string }>;
  }

  export interface SignerMeta {
    signatureType?: number;
    ownerLength?: number;
    signatureLength?: number;
    publicKey?: Uint8Array | Buffer;
    pubLength?: number;
    sigLength?: number;
  }

  export interface SigConfig {
    [key: number]: SignerMeta;
  }

  export const SIG_CONFIG: any;

  export class DataItem {
    constructor(buffer: any);
    
    getRaw(): Uint8Array;
    getSignatureData(): any;
    get rawSignature(): Uint8Array;
    
    static verify(buffer: any): any;
  }

  export function createData(
    data: any, 
    signer: any, 
    opts?: any
  ): DataItem;
}