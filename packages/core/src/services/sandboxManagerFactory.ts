/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  type SandboxManager,
  NoopSandboxManager,
  LocalSandboxManager,
  type GlobalSandboxOptions,
  isContainerRuntime,
} from './sandboxManager.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
import { ContainerSandboxManager } from '../sandbox/container/ContainerSandboxManager.js';
import type { SandboxConfig } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Creates a sandbox manager based on the provided settings.
 *
 * When `SandboxConfig.command` selects a container runtime (`docker`, `podman`
 * or `runsc`), a {@link ContainerSandboxManager} is created and configured with
 * the requested runtime and image so that `SandboxConfig.image` is honored.
 * Otherwise the manager is chosen from the host OS, and if sandboxing is
 * disabled a no-op manager is returned.
 */
export function createSandboxManager(
  sandbox: SandboxConfig | undefined,
  options: GlobalSandboxOptions,
  approvalMode?: string,
): SandboxManager {
  if (!options.modeConfig && options.policyManager && approvalMode) {
    options.modeConfig = options.policyManager.getModeConfig(approvalMode);
  }

  if (sandbox?.enabled) {
    options.networkAccess = sandbox.networkAccess ?? false;

    if (isContainerRuntime(sandbox.command)) {
      options.containerRuntime = sandbox.command;
      options.containerImage = sandbox.image;
      if (!sandbox.image) {
        debugLogger.warn(
          'Containerized sandboxing was requested without an image. Falling back to the default sandbox image.',
        );
      }
      return new ContainerSandboxManager(options);
    }

    if (os.platform() === 'win32') {
      return new WindowsSandboxManager(options);
    } else if (os.platform() === 'linux') {
      return new LinuxSandboxManager(options);
    } else if (os.platform() === 'darwin') {
      return new MacOsSandboxManager(options);
    }
    return new LocalSandboxManager(options);
  }

  return new NoopSandboxManager(options);
}
