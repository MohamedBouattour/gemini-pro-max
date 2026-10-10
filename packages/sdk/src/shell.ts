/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AgentLoopContext,
  ShellExecutionService,
  ShellTool,
  type Config as CoreConfig,
  type ShellExecutionConfig,
} from '@google/gemini-cli-core';
import type {
  AgentShell,
  AgentShellResult,
  AgentShellOptions,
} from './types.js';

/**
 * SDK implementation of {@link AgentShell} that executes commands via the
 * core ShellExecutionService, subject to the agent's security policies.
 *
 * Commands that require interactive confirmation will be rejected since
 * no interactive session is available in headless SDK mode.
 *
 * @remarks In this implementation, stderr is combined into stdout by the
 * underlying ShellExecutionService. As a result, the stderr field of the
 * returned {@link AgentShellResult} will be empty, and both output and
 * stdout will contain the combined output.
 */
export class SdkAgentShell implements AgentShell {
  constructor(private readonly config: CoreConfig) {}

  /**
   * Builds the shell execution config for a single command invocation,
   * applying {@link AgentShellOptions.env} on top of the agent defaults.
   *
   * The requested variables are also added to the sanitization allow-list;
   * without that they would be redacted before reaching the child process.
   */
  private buildShellExecutionConfig(
    env: Record<string, string> | undefined,
  ): ShellExecutionConfig {
    const base = this.config.getShellExecutionConfig();
    if (!env || Object.keys(env).length === 0) {
      return base;
    }

    return {
      ...base,
      env: { ...(base.env ?? process.env), ...env },
      sanitizationConfig: {
        ...base.sanitizationConfig,
        allowedEnvironmentVariables: [
          ...(base.sanitizationConfig.allowedEnvironmentVariables ?? []),
          ...Object.keys(env),
        ],
      },
    };
  }

  async exec(
    command: string,
    options?: AgentShellOptions,
  ): Promise<AgentShellResult> {
    const cwd = options?.cwd || this.config.getWorkingDir();
    const abortController = new AbortController();

    // Wire timeoutSeconds via AbortSignal.timeout, composed with the local
    // controller so policy checks can also cancel the execution.
    let timeoutSignal: AbortSignal | undefined;
    if (options?.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutSignal = AbortSignal.timeout(options.timeoutSeconds * 1000);
    }
    const signal = timeoutSignal
      ? AbortSignal.any([abortController.signal, timeoutSignal])
      : abortController.signal;

    // Use ShellTool to check policy
    const loopContext: AgentLoopContext = this.config;
    const shellTool = new ShellTool(this.config, loopContext.messageBus);
    try {
      const invocation = shellTool.build({
        command,
        dir_path: cwd,
      });

      const confirmation = await invocation.shouldConfirmExecute(signal);
      if (confirmation) {
        throw new Error(
          'Command execution requires confirmation but no interactive session is available.',
        );
      }
    } catch (error) {
      return {
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    const shellExecutionConfig = this.buildShellExecutionConfig(options?.env);

    const handle = await ShellExecutionService.execute(
      command,
      cwd,
      () => {}, // No-op output event handler for now
      signal,
      false, // shouldUseNodePty: false for headless execution
      shellExecutionConfig,
    );

    const result = await handle.result;

    const timedOut = timeoutSignal?.aborted === true;

    return {
      output: result.output,
      stdout: result.output, // ShellExecutionService combines stdout/stderr usually
      stderr: '', // ShellExecutionService currently combines, so stderr is empty or mixed
      exitCode: result.exitCode,
      error: timedOut
        ? new Error(
            `Command timed out after ${options?.timeoutSeconds} seconds: ${command}`,
          )
        : (result.error ?? undefined),
    };
  }
}
