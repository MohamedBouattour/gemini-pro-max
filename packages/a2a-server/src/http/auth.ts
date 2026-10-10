/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { timingSafeEqual } from 'node:crypto';
import { UnauthenticatedUser, type User } from '@a2a-js/sdk/server';
import { logger } from '../utils/logger.js';

/**
 * Environment variable holding the bearer token accepted by the A2A server.
 */
export const BEARER_TOKEN_ENV_VAR = 'A2A_AUTH_TOKEN';

/**
 * Environment variable holding the basic auth credentials accepted by the A2A
 * server, in `username:password` form.
 */
export const BASIC_AUTH_ENV_VAR = 'A2A_BASIC_AUTH';

/**
 * Well-known credentials used only outside production so a developer can hit
 * the server without extra setup. They must never authenticate a production
 * deployment.
 */
const DEV_BEARER_TOKEN = 'dev-token';
const DEV_BASIC_USERNAME = 'admin';
const DEV_BASIC_PASSWORD = 'dev-password';

/**
 * The credentials the A2A server accepts, resolved once at startup.
 */
export interface A2ACredentials {
  /** Accepted bearer token, or `undefined` when bearer auth is disabled. */
  bearerToken?: string;
  /** Accepted basic auth username, or `undefined` when basic auth is disabled. */
  basicUsername?: string;
  /** Accepted basic auth password, or `undefined` when basic auth is disabled. */
  basicPassword?: string;
  /**
   * True when the well-known development credentials are in use because no
   * credentials were configured.
   */
  usingDevDefaults: boolean;
}

/**
 * Compares two secrets without leaking their contents through timing.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Splits `username:password` into its parts, tolerating colons in the password.
 */
function parseBasicCredentials(value: string): {
  username: string;
  password: string;
} {
  const separator = value.indexOf(':');
  if (separator === -1) {
    return { username: '', password: value };
  }
  return {
    username: value.slice(0, separator),
    password: value.slice(separator + 1),
  };
}

/**
 * Resolves the credentials the server accepts from the environment.
 *
 * Configured credentials always win. When nothing is configured the
 * development defaults are used, except in production where the server instead
 * fails closed and rejects every request.
 */
export function resolveCredentials(
  env: NodeJS.ProcessEnv = process.env,
): A2ACredentials {
  const configuredToken = env[BEARER_TOKEN_ENV_VAR]?.trim();
  const configuredBasic = env[BASIC_AUTH_ENV_VAR]?.trim();

  if (configuredToken || configuredBasic) {
    const credentials: A2ACredentials = { usingDevDefaults: false };

    if (configuredToken) {
      credentials.bearerToken = configuredToken;
    }

    if (configuredBasic) {
      if (!configuredBasic.includes(':')) {
        logger.warn(
          `[Auth] ${BASIC_AUTH_ENV_VAR} must be in "username:password" form; basic auth will not accept this value.`,
        );
      } else {
        const { username, password } = parseBasicCredentials(configuredBasic);
        credentials.basicUsername = username;
        credentials.basicPassword = password;
      }
    }

    return credentials;
  }

  if (env['NODE_ENV'] === 'production') {
    logger.warn(
      `[Auth] Neither ${BEARER_TOKEN_ENV_VAR} nor ${BASIC_AUTH_ENV_VAR} is set. Refusing all authenticated requests in production; set one to enable the A2A server.`,
    );
    return { usingDevDefaults: false };
  }

  logger.warn(
    `[Auth] Neither ${BEARER_TOKEN_ENV_VAR} nor ${BASIC_AUTH_ENV_VAR} is set. Falling back to well-known development credentials. Do not run without credentials in production.`,
  );
  return {
    bearerToken: DEV_BEARER_TOKEN,
    basicUsername: DEV_BASIC_USERNAME,
    basicPassword: DEV_BASIC_PASSWORD,
    usingDevDefaults: true,
  };
}

/**
 * Authenticates a raw `Authorization` header value against the resolved
 * credentials. Anything unparsable or mismatched yields an unauthenticated
 * user.
 */
export function authenticate(
  authorization: string | undefined,
  credentials: A2ACredentials,
): User {
  if (!authorization) {
    return new UnauthenticatedUser();
  }

  const separator = authorization.indexOf(' ');
  if (separator === -1) {
    return new UnauthenticatedUser();
  }

  const scheme = authorization.slice(0, separator);
  const value = authorization.slice(separator + 1).trim();

  if (value.length === 0) {
    return new UnauthenticatedUser();
  }

  if (scheme.toLowerCase() === 'bearer') {
    if (
      credentials.bearerToken &&
      constantTimeEquals(value, credentials.bearerToken)
    ) {
      return { userName: 'bearer-user', isAuthenticated: true };
    }
    return new UnauthenticatedUser();
  }

  if (scheme.toLowerCase() === 'basic') {
    if (credentials.basicUsername === undefined) {
      return new UnauthenticatedUser();
    }

    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const { username, password } = parseBasicCredentials(decoded);
    if (
      constantTimeEquals(username, credentials.basicUsername) &&
      constantTimeEquals(password, credentials.basicPassword ?? '')
    ) {
      return { userName: 'basic-user', isAuthenticated: true };
    }
    return new UnauthenticatedUser();
  }

  return new UnauthenticatedUser();
}
