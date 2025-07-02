/**
 * Security utilities for cryptographic operations and input validation
 */

import { CryptographicError, ValidationError, ErrorCode } from './errors';
import { JWK } from './types';

// Security constants
const MIN_RSA_KEY_SIZE = 2048;
const MAX_RSA_KEY_SIZE = 8192;
const REQUIRED_JWK_FIELDS = ['kty', 'n', 'e'] as const;
const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi'] as const;

/**
 * Validates JWK structure and security properties
 */
export function validateJWK(jwk: unknown): asserts jwk is JWK {
  if (!jwk || typeof jwk !== 'object') {
    throw new ValidationError(
      ErrorCode.VALIDATION_MISSING_FIELDS,
      'JWK must be a valid object',
      {
        provided: typeof jwk,
        suggestion: 'Provide a valid JWK object with required cryptographic keys'
      }
    );
  }

  const jwkObj = jwk as Record<string, unknown>;

  // Check required fields
  for (const field of REQUIRED_JWK_FIELDS) {
    if (!jwkObj[field] || typeof jwkObj[field] !== 'string') {
      throw new ValidationError(
        ErrorCode.VALIDATION_MISSING_FIELDS,
        `JWK missing required field: ${field}`,
        {
          provided: Object.keys(jwkObj),
          required: REQUIRED_JWK_FIELDS,
          suggestion: `Ensure JWK contains valid ${field} field`
        }
      );
    }
  }

  // Validate key type
  if (jwkObj.kty !== 'RSA') {
    throw new CryptographicError(
      ErrorCode.CRYPTO_SIGNER_TYPE_UNKNOWN,
      `Unsupported key type: ${jwkObj.kty}`,
      {
        provided: jwkObj.kty,
        supported: ['RSA'],
        suggestion: 'Use RSA keys for Arweave signing'
      }
    );
  }

  // Validate RSA modulus (n) for security
  const modulus = jwkObj.n as string;
  try {
    const decodedModulus = Buffer.from(modulus, 'base64url');
    const keySize = decodedModulus.length * 8;
    
    if (keySize < MIN_RSA_KEY_SIZE) {
      throw new CryptographicError(
        ErrorCode.CRYPTO_INVALID_SIGNATURE,
        `RSA key size too small: ${keySize} bits`,
        {
          provided: keySize,
          minimum: MIN_RSA_KEY_SIZE,
          suggestion: 'Use at least 2048-bit RSA keys for security'
        }
      );
    }

    if (keySize > MAX_RSA_KEY_SIZE) {
      throw new CryptographicError(
        ErrorCode.CRYPTO_INVALID_SIGNATURE,
        `RSA key size too large: ${keySize} bits`,
        {
          provided: keySize,
          maximum: MAX_RSA_KEY_SIZE,
          suggestion: 'RSA keys larger than 8192 bits may cause performance issues'
        }
      );
    }
  } catch (error) {
    if (error instanceof CryptographicError) {
      throw error;
    }
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      'Invalid base64url encoding in JWK modulus',
      {
        field: 'n',
        suggestion: 'Ensure JWK modulus is properly base64url encoded'
      }
    );
  }

  // Validate private key fields if present
  const hasPrivateKey = PRIVATE_JWK_FIELDS.some(field => jwkObj[field]);
  if (hasPrivateKey) {
    for (const field of PRIVATE_JWK_FIELDS) {
      if (jwkObj[field] && typeof jwkObj[field] !== 'string') {
        throw new ValidationError(
          ErrorCode.VALIDATION_INVALID_FORMAT,
          `Invalid private key field: ${field}`,
          {
            field,
            suggestion: 'Private key fields must be base64url encoded strings'
          }
        );
      }
    }
  }
}

/**
 * Validates signature data before processing
 */
export function validateSignatureData(signature: unknown, context: string = 'signature'): asserts signature is Buffer | Uint8Array {
  if (!signature) {
    throw new CryptographicError(
      ErrorCode.CRYPTO_MISSING_SIGNATURE,
      `Missing ${context} data`,
      {
        context,
        suggestion: 'Ensure signature data is provided and not null/undefined'
      }
    );
  }

  if (!(signature instanceof Buffer) && !(signature instanceof Uint8Array)) {
    throw new CryptographicError(
      ErrorCode.CRYPTO_INVALID_SIGNATURE,
      `Invalid ${context} format`,
      {
        provided: typeof signature,
        expected: ['Buffer', 'Uint8Array'],
        context,
        suggestion: 'Signature must be Buffer or Uint8Array'
      }
    );
  }

  // Check for reasonable signature length (RSA signatures are typically 256-1024 bytes)
  if (signature.length < 64 || signature.length > 2048) {
    throw new CryptographicError(
      ErrorCode.CRYPTO_INVALID_SIGNATURE,
      `Suspicious ${context} length: ${signature.length} bytes`,
      {
        length: signature.length,
        context,
        suggestion: 'RSA signatures should typically be 256-1024 bytes'
      }
    );
  }
}

/**
 * Validates data before cryptographic hashing
 */
export function validateHashInput(data: unknown, context: string = 'data'): asserts data is ArrayBuffer | Uint8Array | Buffer {
  if (!data) {
    throw new ValidationError(
      ErrorCode.VALIDATION_MISSING_FIELDS,
      `Missing ${context} for hashing`,
      {
        context,
        suggestion: 'Provide data to be hashed'
      }
    );
  }

  if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array) && !(data instanceof Buffer)) {
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `Invalid ${context} format for hashing`,
      {
        provided: typeof data,
        expected: ['ArrayBuffer', 'Uint8Array', 'Buffer'],
        context,
        suggestion: 'Convert data to binary format before hashing'
      }
    );
  }
}

/**
 * Sanitizes sensitive data by overwriting with random bytes
 */
export function sanitizeBytes(data: Uint8Array | Buffer): void {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Browser environment
    const randomBytes = new Uint8Array(data.length);
    crypto.getRandomValues(randomBytes);
    data.set(randomBytes);
  } else {
    // Node.js environment
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(data.length);
    data.set(randomBytes);
  }
}

/**
 * Constant-time comparison for security-sensitive operations
 */
export function constantTimeEquals(a: Uint8Array | Buffer, b: Uint8Array | Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Validates string inputs for base64url encoding
 */
export function validateBase64Url(input: string, fieldName: string): void {
  if (typeof input !== 'string') {
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `${fieldName} must be a string`,
      {
        provided: typeof input,
        field: fieldName,
        suggestion: 'Provide a valid base64url encoded string'
      }
    );
  }

  // Base64url character set: A-Z, a-z, 0-9, -, _
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(input)) {
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `${fieldName} contains invalid base64url characters`,
      {
        field: fieldName,
        suggestion: 'Use only A-Z, a-z, 0-9, -, _ characters (no padding)'
      }
    );
  }

  // Check for minimum reasonable length
  if (input.length < 4) {
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `${fieldName} too short for valid base64url`,
      {
        length: input.length,
        field: fieldName,
        suggestion: 'Ensure the encoded data is complete'
      }
    );
  }
}

/**
 * Rate limiting for cryptographic operations to prevent abuse
 */
class CryptoRateLimiter {
  private operations: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly windowMs: number;
  private readonly maxOperations: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs: number = 60000, maxOperations: number = 100) {
    this.windowMs = windowMs;
    this.maxOperations = maxOperations;
    
    // Periodic cleanup to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [identifier, data] of this.operations.entries()) {
      if (now - data.windowStart >= this.windowMs) {
        this.operations.delete(identifier);
      }
    }
  }

  checkLimit(identifier: string): void {
    const now = Date.now();
    const existing = this.operations.get(identifier);
    
    if (!existing || now - existing.windowStart >= this.windowMs) {
      // New window or first operation
      this.operations.set(identifier, { count: 1, windowStart: now });
      return;
    }
    
    // Within the same window
    if (existing.count >= this.maxOperations) {
      throw new CryptographicError(
        ErrorCode.CRYPTO_RATE_LIMIT_EXCEEDED,
        'Too many cryptographic operations',
        {
          identifier,
          limit: this.maxOperations,
          window: this.windowMs,
          suggestion: 'Reduce the frequency of cryptographic operations'
        }
      );
    }

    existing.count++;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Global rate limiter instance
export const cryptoRateLimiter = new CryptoRateLimiter();

/**
 * Secure random number generation for nonces and salts
 */
export function generateSecureRandom(length: number): Uint8Array {
  if (length <= 0 || length > 1024) {
    throw new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      'Invalid random data length',
      {
        provided: length,
        range: '1-1024',
        suggestion: 'Request reasonable amount of random data'
      }
    );
  }

  const randomBytes = new Uint8Array(length);
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    // Node.js fallback
    const crypto = require('crypto');
    const nodeRandomBytes = crypto.randomBytes(length);
    randomBytes.set(nodeRandomBytes);
  }

  return randomBytes;
}