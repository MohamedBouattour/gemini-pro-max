/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ShellExecutionService,
  ShellTool,
  type Config as CoreConfig,
  type ShellExecutionConfig,
} from '@google/gemini-cli-core';
import { SdkAgentShell } from './shell.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    ShellExecutionService: {
      execute: vi.fn(),
    },
  };
});

const executeMock = vi.mocked(ShellExecutionService.execute);

describe('SdkAgentShell', () => {
  let getShellExecutionConfig: ReturnType<typeof vi.fn>;
  let getWorkingDir: ReturnType<typeof vi.fn>;
  let config: CoreConfig;
  let shell: SdkAgentShell;

  beforeEach(() => {
    vi.clearAllMocks();

    getShellExecutionConfig = vi.fn(
      (): ShellExecutionConfig => ({
        env: { BASE: 'base-value' },
        sanitizationConfig: {
          allowedEnvironmentVariables: ['BASE'],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: true,
        },
        sandboxManager: {} as unknown as ShellExecutionConfig['sandboxManager'],
      }),
    );
    getWorkingDir = vi.fn().mockReturnValue('/workspace');
    // `Config` doubles as its own `AgentLoopContext`, so `config` is self-referential.
    config = {
      getShellExecutionConfig,
      getWorkingDir,
      messageBus: {},
      isInteractiveShellEnabled: () => false,
      getEnableShellOutputEfficiency: () => false,
      getSandboxEnabled: () => false,
      config: undefined,
    } as unknown as CoreConfig;
    (config as unknown as { config: CoreConfig }).config = config;

    shell = new SdkAgentShell(config);

    executeMock.mockImplementation(
      async () =>
        ({
          result: Promise.resolve({
            output: 'ok',
            stdout: 'ok',
            stderr: '',
            exitCode: 0,
            error: undefined,
          }),
          pid: 1234,
        }) as unknown as Awaited<
          ReturnType<typeof ShellExecutionService.execute>
        >,
    );

    vi.spyOn(ShellTool.prototype, 'build').mockReturnValue({
      shouldConfirmExecute: vi.fn().mockResolvedValue(false),
    } as unknown as ReturnType<ShellTool['build']>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes the command in the working directory', async () => {
    const result = await shell.exec('echo hello');

    expect(executeMock).toHaveBeenCalledTimes(1);
    const [command, cwd] = executeMock.mock.calls[0];
    expect(command).toBe('echo hello');
    expect(cwd).toBe('/workspace');
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('ok');
    expect(result.error).toBeUndefined();
  });

  it('prefers the cwd option over the configured working directory', async () => {
    await shell.exec('echo hello', { cwd: '/elsewhere' });

    expect(executeMock.mock.calls[0][1]).toBe('/elsewhere');
  });

  it('passes requested env vars and allow-lists them for sanitization', async () => {
    await shell.exec('echo $SECRET', {
      env: { SECRET: 's3cret', OTHER: 'value' },
    });

    const shellExecutionConfig = executeMock.mock.calls[0][5] as
      | ShellExecutionConfig
      | undefined;

    expect(shellExecutionConfig?.env).toEqual({
      BASE: 'base-value',
      SECRET: 's3cret',
      OTHER: 'value',
    });
    expect(shellExecutionConfig?.sanitizationConfig).toEqual({
      allowedEnvironmentVariables: ['BASE', 'SECRET', 'OTHER'],
      blockedEnvironmentVariables: [],
      enableEnvironmentVariableRedaction: true,
    });
  });

  it('leaves the base config untouched when no env is requested', async () => {
    await shell.exec('echo hello');

    expect(executeMock.mock.calls[0][5]).toBe(
      getShellExecutionConfig.mock.results[0].value,
    );
  });

  it('aborts execution and reports a timeout error', async () => {
    executeMock.mockImplementation(
      async (_command, _cwd, _onOutput, signal) => {
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        return {
          result: Promise.resolve({
            output: '',
            stdout: '',
            stderr: '',
            exitCode: 143,
            error: new Error('aborted'),
          }),
          pid: 1,
        } as unknown as Awaited<
          ReturnType<typeof ShellExecutionService.execute>
        >;
      },
    );

    const result = await shell.exec('sleep 5', { timeoutSeconds: 0.05 });

    expect(result.exitCode).not.toBe(0);
    expect(result.error?.message).toContain('timed out');
    expect(result.error?.message).toContain('sleep 5');
  });

  it('does not report a timeout error when execution finishes in time', async () => {
    const result = await shell.exec('echo hello', { timeoutSeconds: 30 });

    expect(result.error).toBeUndefined();
  });

  it('propagates execution errors from the shell service', async () => {
    const failure = new Error('spawn failed');
    executeMock.mockResolvedValue({
      result: Promise.resolve({
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: failure,
      }),
      pid: 1,
    } as unknown as Awaited<ReturnType<typeof ShellExecutionService.execute>>);

    const result = await shell.exec('bad-command');

    expect(result.error).toBe(failure);
  });

  it('fails without executing when confirmation is required', async () => {
    vi.spyOn(ShellTool.prototype, 'build').mockReturnValue({
      shouldConfirmExecute: vi.fn().mockResolvedValue({
        type: 'info',
        title: 'Confirm',
        prompt: 'run?',
      }),
    } as unknown as ReturnType<ShellTool['build']>);

    const result = await shell.exec('rm -rf /');

    expect(executeMock).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.error?.message).toContain('requires confirmation');
  });

  it('fails without executing when the policy check throws', async () => {
    vi.spyOn(ShellTool.prototype, 'build').mockReturnValue({
      shouldConfirmExecute: vi
        .fn()
        .mockRejectedValue(new Error('denied by policy')),
    } as unknown as ReturnType<ShellTool['build']>);

    const result = await shell.exec('rm -rf /');

    expect(executeMock).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.error?.message).toBe('denied by policy');
  });
});
