export type AnchorErrorCode =
  | 'SEP1_ERROR'
  | 'SEP10_ERROR'
  | 'SEP12_ERROR'
  | 'SEP24_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_FAILED'
  | 'ANCHOR_ERROR';

export class AnchorClientError extends Error {
  readonly code: AnchorErrorCode;
  readonly statusCode?: number | undefined;
  readonly details?: unknown;

  constructor(
    code: AnchorErrorCode,
    message: string,
    options?: { statusCode?: number | undefined; details?: unknown },
  ) {
    super(message);
    this.name = 'AnchorClientError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
}

export class Sep1Error extends AnchorClientError {
  constructor(message: string, details?: unknown) {
    super('SEP1_ERROR', message, { details });
    this.name = 'Sep1Error';
  }
}

export class Sep10Error extends AnchorClientError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super('SEP10_ERROR', message, {
      ...(statusCode !== undefined ? { statusCode } : {}),
      details,
    });
    this.name = 'Sep10Error';
  }
}

export class Sep12Error extends AnchorClientError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super('SEP12_ERROR', message, {
      ...(statusCode !== undefined ? { statusCode } : {}),
      details,
    });
    this.name = 'Sep12Error';
  }
}

export class Sep24Error extends AnchorClientError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super('SEP24_ERROR', message, {
      ...(statusCode !== undefined ? { statusCode } : {}),
      details,
    });
    this.name = 'Sep24Error';
  }
}

export class TimeoutError extends AnchorClientError {
  constructor(message = 'Request timed out') {
    super('TIMEOUT_ERROR', message);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends AnchorClientError {
  constructor(message: string, details?: unknown) {
    super('NETWORK_ERROR', message, { details });
    this.name = 'NetworkError';
  }
}
