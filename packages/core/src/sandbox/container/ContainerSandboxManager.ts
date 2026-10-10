/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type GlobalSandboxOptions,
  type SandboxRequest,
  type SandboxedCommand,
  type SandboxManager,
  type SandboxPermissions,
  type ParsedSandboxDenial,
  resolveSandboxPaths,
} from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import {
  sanitizeEnvironment,
  getSecureSanitizationConfig,
} from '../../services/environmentSanitization.js';
import {
  isKnownSafeCommand,
  isDangerousCommand,
} from '../utils/commandSafety.js';
import {
  parsePosixSandboxDenials,
  createSandboxDenialCache,
  type SandboxDenialCache,
} from '../utils/sandboxDenialUtils.js';
import {
  isStrictlyApproved,
  verifySandboxOverrides,
} from '../utils/commandUtils.js';
import { handleReadWriteCommands } from '../utils/sandboxReadWriteUtils.js';

/** The image used when `SandboxConfig.image` is not supplied. */
export const DEFAULT_CONTAINER_SANDBOX_IMAGE = 'gemini-cli-sandbox';

/** The in-container mount point for the primary workspace. */
export const CONTAINER_WORKSPACE_DIR = '/workspace';

/**
 * Environment variables forwarded to the container runtime itself (e.g. to
 * locate `DOCKER_HOST` or `CONTAINER_HOST`). These must not be forwarded into
 * the container.
 */
const RUNTIME_ENV_KEYS = ['DOCKER_HOST', 'CONTAINER_HOST'] as const;

/**
 * A SandboxManager that executes every command inside a container image using
 * `docker`/`podman`, honouring `SandboxConfig.command` and `SandboxConfig.image`.
 *
 * This makes containerized tool sandboxing reachable from the `sandbox` settings
 * object instead of silently degrading to the host OS sandbox primitive.
 */
export class ContainerSandboxManager implements SandboxManager {
  private readonly denialCache: SandboxDenialCache = createSandboxDenialCache();

  constructor(private readonly options: GlobalSandboxOptions) {}

  isKnownSafeCommand(args: string[], cwd?: string): boolean {
    const effectiveCwd = cwd ?? this.options.workspace;
    return isKnownSafeCommand(args, effectiveCwd, this.options.workspace);
  }

  isDangerousCommand(args: string[], cwd?: string): boolean {
    const effectiveCwd = cwd ?? this.options.workspace;
    return isDangerousCommand(args, effectiveCwd, this.options.workspace);
  }

  parseDenials(result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return parsePosixSandboxDenials(result, this.denialCache);
  }

  getWorkspace(): string {
    return this.options.workspace;
  }

  getOptions(): GlobalSandboxOptions {
    return this.options;
  }

  /** The container runtime binary that will be spawned on the host. */
  getContainerRuntimeBinary(): string {
    // `runsc` is a Docker runtime rather than a CLI, so it is driven through
    // docker with `--runtime=runsc`.
    return this.options.containerRuntime === 'podman' ? 'podman' : 'docker';
  }

  /** The container image commands are executed in. */
  getContainerImage(): string {
    return this.options.containerImage || DEFAULT_CONTAINER_SANDBOX_IMAGE;
  }

  async prepareCommand(req: SandboxRequest): Promise<SandboxedCommand> {
    const allowOverrides = this.options.modeConfig?.allowOverrides ?? true;
    verifySandboxOverrides(allowOverrides, req.policy);

    const sanitizationConfig = getSecureSanitizationConfig(
      req.policy?.sanitizationConfig,
    );
    const sanitizedEnv = sanitizeEnvironment(req.env, sanitizationConfig);

    const isReadonlyMode = this.options.modeConfig?.readonly ?? true;
    const isYolo = this.options.modeConfig?.yolo ?? false;
    const isApproved = allowOverrides
      ? await isStrictlyApproved(req, this.options.modeConfig?.approvedTools)
      : false;
    const workspaceWrite = !isReadonlyMode || isApproved || isYolo;
    const networkAccess =
      this.options.networkAccess ??
      this.options.modeConfig?.network ??
      req.policy?.networkAccess ??
      isYolo;

    const mergedAdditional: SandboxPermissions = {
      fileSystem: {
        read: [...(req.policy?.additionalPermissions?.fileSystem?.read ?? [])],
        write: [
          ...(req.policy?.additionalPermissions?.fileSystem?.write ?? []),
        ],
      },
      network: networkAccess,
    };

    const resolvedPaths = await resolveSandboxPaths(
      this.options,
      req,
      mergedAdditional,
    );

    const { command: finalCommand, args: finalArgs } = handleReadWriteCommands(
      req,
      mergedAdditional,
      this.options.workspace,
      [
        ...(req.policy?.allowedPaths || []),
        ...(this.options.includeDirectories || []),
      ],
    );

    const args = [
      'run',
      '-i',
      '--rm',
      '--init',
      '--workdir',
      CONTAINER_WORKSPACE_DIR,
      // The requested command replaces the image entrypoint.
      '--entrypoint',
      '',
    ];

    if (this.options.containerRuntime === 'runsc') {
      args.push('--runtime=runsc');
    }

    if (!networkAccess) {
      args.push('--network', 'none');
    }

    args.push('--env', `GEMINI_SANDBOX=${this.options.containerRuntime}`);

    args.push(
      '--volume',
      `${resolvedPaths.workspace.resolved}:${CONTAINER_WORKSPACE_DIR}${workspaceWrite ? '' : ':ro'}`,
    );

    for (const include of resolvedPaths.globalIncludes) {
      args.push(
        '--volume',
        `${include}:${include}${workspaceWrite ? '' : ':ro'}`,
      );
    }

    for (const allowed of [
      ...resolvedPaths.policyRead,
      ...resolvedPaths.policyWrite,
    ]) {
      args.push('--volume', `${allowed}:${allowed}:ro`);
    }

    args.push(this.getContainerImage());

    // The final command may itself be a shell wrapper (e.g. `bash -lc "..."`),
    // so it is preserved verbatim and evaluated by the container shell.
    args.push('/bin/sh', '-c', [finalCommand, ...finalArgs].join(' '));

    const runtimeEnv: NodeJS.ProcessEnv = { ...sanitizedEnv };
    for (const key of RUNTIME_ENV_KEYS) {
      const value = process.env[key];
      if (value !== undefined) {
        runtimeEnv[key] = value;
      }
    }

    return {
      program: this.getContainerRuntimeBinary(),
      args,
      env: runtimeEnv,
      cwd: req.cwd,
    };
  }
}
