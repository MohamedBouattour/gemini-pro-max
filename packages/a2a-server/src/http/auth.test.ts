/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authenticate,
  resolveCredentials,
  BEARER_TOKEN_ENV_VAR,
  BASIC_AUTH_ENV_VAR,
} from './auth.js';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const encodeBasic = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64');

describe('resolveCredentials', () => {
  it('uses the configured bearer token', () => {
    const credentials = resolveCredentials({
      [BEARER_TOKEN_ENV_VAR]: 'super-secret',
    } as NodeJS.ProcessEnv);

    expect(credentials).toEqual({
      bearerToken: 'super-secret',
      usingDevDefaults: false,
    });
  });

  it('uses the configured basic credentials', () => {
    const credentials = resolveCredentials({
      [BASIC_AUTH_ENV_VAR]: 'alice:hunter2',
    } as NodeJS.ProcessEnv);

    expect(credentials).toEqual({
      basicUsername: 'alice',
      basicPassword: 'hunter2',
      usingDevDefaults: false,
    });
  });

  it('accepts both schemes when both are configured', () => {
    const credentials = resolveCredentials({
      [BEARER_TOKEN_ENV_VAR]: 'token',
      [BASIC_AUTH_ENV_VAR]: 'alice:hunter2',
    } as NodeJS.ProcessEnv);

    expect(credentials).toEqual({
      bearerToken: 'token',
      basicUsername: 'alice',
      basicPassword: 'hunter2',
      usingDevDefaults: false,
    });
  });

  it('keeps colons in the basic auth password', () => {
    const credentials = resolveCredentials({
      [BASIC_AUTH_ENV_VAR]: 'alice:a:b:c',
    } as NodeJS.ProcessEnv);

    expect(credentials.basicUsername).toBe('alice');
    expect(credentials.basicPassword).toBe('a:b:c');
  });

  it('disables basic auth when the value has no username separator', () => {
    const credentials = resolveCredentials({
      [BASIC_AUTH_ENV_VAR]: 'justpassword',
    } as NodeJS.ProcessEnv);

    expect(credentials.basicUsername).toBeUndefined();
    expect(credentials.bearerToken).toBeUndefined();
  });

  it('ignores empty and whitespace-only configuration', () => {
    const credentials = resolveCredentials({
      [BEARER_TOKEN_ENV_VAR]: '   ',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(credentials).toEqual({ usingDevDefaults: false });
  });

  it('falls back to development defaults outside production', () => {
    const credentials = resolveCredentials({} as NodeJS.ProcessEnv);

    expect(credentials.usingDevDefaults).toBe(true);
    expect(credentials.bearerToken).toBeTruthy();
    expect(credentials.basicUsername).toBeTruthy();
    expect(credentials.basicPassword).toBeTruthy();
  });

  it('fails closed in production when nothing is configured', () => {
    const credentials = resolveCredentials({
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(credentials).toEqual({ usingDevDefaults: false });
    expect(credentials.bearerToken).toBeUndefined();
    expect(credentials.basicPassword).toBeUndefined();
  });

  it('never falls back to defaults in production', () => {
    const credentials = resolveCredentials({
      NODE_ENV: 'production',
      [BEARER_TOKEN_ENV_VAR]: 'real-token',
    } as NodeJS.ProcessEnv);

    expect(credentials.usingDevDefaults).toBe(false);
    expect(credentials.bearerToken).toBe('real-token');
  });
});

describe('authenticate', () => {
  const credentials = {
    bearerToken: 'super-secret',
    basicUsername: 'alice',
    basicPassword: 'hunter2',
    usingDevDefaults: false,
  };

  it('rejects a missing header', () => {
    expect(authenticate(undefined, credentials).isAuthenticated).toBe(false);
  });

  it('rejects a header without a scheme', () => {
    expect(authenticate('super-secret', credentials).isAuthenticated).toBe(
      false,
    );
  });

  it('rejects an empty credential', () => {
    expect(authenticate('Bearer ', credentials).isAuthenticated).toBe(false);
  });

  it('accepts the configured bearer token', () => {
    const user = authenticate('Bearer super-secret', credentials);
    expect(user.isAuthenticated).toBe(true);
    expect(user.userName).toBe('bearer-user');
  });

  it('accepts the bearer scheme case-insensitively', () => {
    expect(
      authenticate('bearer super-secret', credentials).isAuthenticated,
    ).toBe(true);
  });

  it('rejects a wrong bearer token', () => {
    expect(authenticate('Bearer wrong', credentials).isAuthenticated).toBe(
      false,
    );
  });

  it('rejects the legacy hardcoded bearer token', () => {
    expect(
      authenticate('Bearer valid-token', credentials).isAuthenticated,
    ).toBe(false);
  });

  it('accepts the configured basic credentials', () => {
    const user = authenticate(
      `Basic ${encodeBasic('alice:hunter2')}`,
      credentials,
    );
    expect(user.isAuthenticated).toBe(true);
    expect(user.userName).toBe('basic-user');
  });

  it('rejects a wrong basic password', () => {
    expect(
      authenticate(`Basic ${encodeBasic('alice:wrong')}`, credentials)
        .isAuthenticated,
    ).toBe(false);
  });

  it('rejects a wrong basic username', () => {
    expect(
      authenticate(`Basic ${encodeBasic('bob:hunter2')}`, credentials)
        .isAuthenticated,
    ).toBe(false);
  });

  it('rejects the legacy hardcoded basic credentials', () => {
    expect(
      authenticate(`Basic ${encodeBasic('admin:password')}`, credentials)
        .isAuthenticated,
    ).toBe(false);
  });

  it('rejects bearer tokens with a different length', () => {
    expect(
      authenticate(`Bearer ${'super-secret'.repeat(10)}`, credentials)
        .isAuthenticated,
    ).toBe(false);
  });

  it('rejects unknown schemes', () => {
    expect(
      authenticate('Digest super-secret', credentials).isAuthenticated,
    ).toBe(false);
  });

  it('rejects bearer auth when only basic auth is configured', () => {
    expect(
      authenticate('Bearer super-secret', {
        basicUsername: 'alice',
        basicPassword: 'hunter2',
        usingDevDefaults: false,
      }).isAuthenticated,
    ).toBe(false);
  });

  it('rejects basic auth when only bearer auth is configured', () => {
    expect(
      authenticate(`Basic ${encodeBasic('alice:hunter2')}`, {
        bearerToken: 'super-secret',
        usingDevDefaults: false,
      }).isAuthenticated,
    ).toBe(false);
  });

  it('rejects everything when no credentials are configured', () => {
    const empty = { usingDevDefaults: false };
    expect(authenticate('Bearer super-secret', empty).isAuthenticated).toBe(
      false,
    );
    expect(
      authenticate(`Basic ${encodeBasic('alice:hunter2')}`, empty)
        .isAuthenticated,
    ).toBe(false);
  });

  it('tolerates extra whitespace after the scheme', () => {
    expect(
      authenticate('Bearer    super-secret', credentials).isAuthenticated,
    ).toBe(true);
  });
});

describe('development fallback round trip', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv(BEARER_TOKEN_ENV_VAR, '');
    vi.stubEnv(BASIC_AUTH_ENV_VAR, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the development credentials it advertises', () => {
    const credentials = resolveCredentials();

    expect(
      authenticate(`Bearer ${credentials.bearerToken}`, credentials)
        .isAuthenticated,
    ).toBe(true);
    expect(
      authenticate(
        `Basic ${encodeBasic(`${credentials.basicUsername}:${credentials.basicPassword}`)}`,
        credentials,
      ).isAuthenticated,
    ).toBe(true);
  });
});
