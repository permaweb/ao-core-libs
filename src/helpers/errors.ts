/**
 * Custom error classes for AO Core SDK
 */

export enum ErrorCode {
  // Validation errors
  VALIDATION_MISSING_DEPENDENCIES = 'VALIDATION_MISSING_DEPENDENCIES',
  VALIDATION_MISSING_JWK_OR_SIGNER = 'VALIDATION_MISSING_JWK_OR_SIGNER',
  VALIDATION_MISSING_PATH = 'VALIDATION_MISSING_PATH',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_MISSING_FIELDS = 'VALIDATION_MISSING_FIELDS',

  // Cryptographic errors
  CRYPTO_SIGNER_TYPE_UNKNOWN = 'CRYPTO_SIGNER_TYPE_UNKNOWN',
  CRYPTO_SIGNATURE_METADATA_NOT_FOUND = 'CRYPTO_SIGNATURE_METADATA_NOT_FOUND',
  CRYPTO_CREATE_NOT_INVOKED = 'CRYPTO_CREATE_NOT_INVOKED',
  CRYPTO_MISSING_SIGNATURE = 'CRYPTO_MISSING_SIGNATURE',
  CRYPTO_INVALID_SIGNATURE = 'CRYPTO_INVALID_SIGNATURE',
  CRYPTO_RATE_LIMIT_EXCEEDED = 'CRYPTO_RATE_LIMIT_EXCEEDED',

  // Request/Network errors
  REQUEST_PREPARATION_FAILED = 'REQUEST_PREPARATION_FAILED',
  REQUEST_FORMATTING_FAILED = 'REQUEST_FORMATTING_FAILED',
  REQUEST_HTTP_FAILED = 'REQUEST_HTTP_FAILED',

  // Encoding/Decoding errors
  ENCODING_UNSUPPORTED_VALUE = 'ENCODING_UNSUPPORTED_VALUE',
  ENCODING_UNSUPPORTED_INPUT_TYPE = 'ENCODING_UNSUPPORTED_INPUT_TYPE',
  ENCODING_NO_DECODER = 'ENCODING_NO_DECODER',
}

export class AOCoreError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AOCoreError';
    this.code = code;
    this.context = context;
    this.originalError = originalError;

    // Preserve original stack trace if available
    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

export class ValidationError extends AOCoreError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(code, message, context);
    this.name = 'ValidationError';
  }
}

export class CryptographicError extends AOCoreError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(code, message, context, originalError);
    this.name = 'CryptographicError';
  }
}

export class RequestError extends AOCoreError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(code, message, context, originalError);
    this.name = 'RequestError';
  }
}

export class EncodingError extends AOCoreError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(code, message, context, originalError);
    this.name = 'EncodingError';
  }
}