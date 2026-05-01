/**
 * Structured Logger - Pino-based JSON logging with request tracking
 */

import pino from 'pino';

/** Log level configuration */
export interface LoggerConfig {
  level: string;
  service: string;
  environment: string;
}

/** Context for request logging */
export interface LogContext {
  requestId: string;
  userId?: string;
  budgetId?: string;
}

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'phone', regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { name: 'ssn', regex: /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g },
  { name: 'creditCard', regex: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g },
  { name: 'ipAddress', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'ipv6Address', regex: /\b([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/g },
];

const PII_REDACTED = '[REDACTED_PII]';

/** Create a structured logger instance */
export function createLogger(config: Partial<LoggerConfig> = {}): pino.Logger {
  const loggerConfig: LoggerConfig = {
    level: config.level ?? process.env.LOG_LEVEL ?? 'info',
    service: config.service ?? 'llm-router',
    environment: config.environment ?? process.env.NODE_ENV ?? 'development',
  };

  return pino({
    level: loggerConfig.level,
    base: {
      service: loggerConfig.service,
      environment: loggerConfig.environment,
    },
    redact: {
      paths: ['prompt', 'response', '*.prompt', '*.response', '*.apiKey', '*.token'],
      censor: '[REDACTED]',
    },
    formatters: {
      bindings: (bindings): Record<string, string | number | undefined> => ({
        pid: bindings.pid,
        host: bindings.host,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Child logger with request context */
export function childLogger(logger: pino.Logger, context: LogContext): pino.Logger {
  return logger.child({
    requestId: context.requestId,
    userId: context.userId,
    budgetId: context.budgetId,
  });
}

/** Recursively redaction sensitive fields from an object */
function redactObject(
  obj: Record<string, unknown>,
  sensitiveKeys: Set<string>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactPIIPatterns(value);
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((item) =>
        typeof item === 'string' ? redactPIIPatterns(item) : item,
      );
    } else if (value !== null && typeof value === 'object') {
      redacted[key] = redactObject(value as Record<string, unknown>, sensitiveKeys);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/** Redact sensitive fields from log output */
export function redactSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set(['apiKey', 'token', 'secret', 'password', 'prompt', 'response']);
  return redactObject(obj, sensitiveKeys);
}

/** Redact PII patterns from a string value */
export function redactPIIPatterns(value: string): string {
  let result = value;
  for (const pattern of PII_PATTERNS) {
    // Ensure the regex has global flag for replaceAll
    const regex = pattern.regex.global
      ? pattern.regex
      : new RegExp(pattern.regex.source, pattern.regex.flags + 'g');
    result = result.replaceAll(regex, PII_REDACTED);
  }
  return result;
}

/** Detect if a string contains PII */
export function containsPII(value: string): boolean {
  return PII_PATTERNS.some((pattern) => {
    pattern.regex.lastIndex = 0; // Reset for global regex
    return pattern.regex.test(value);
  });
}

/** Default logger instance */
export const logger = createLogger();
