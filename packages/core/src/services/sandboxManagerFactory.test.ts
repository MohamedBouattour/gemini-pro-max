/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/paths.js', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/paths.js')>(
      '../utils/paths.js',
    );
  return {
    ...actual,
    resolveToRealPath: vi.fn((p: string) => p),
  };
});

vi.mock('../sandbox/utils/fsUtils.js', async () => {
  const actual = await vi.importActual<
    typeof import('../sandbox/utils/fsUtils.js')
  >('../sandbox/utils/fsUtils.js');
  return {
    ...actual,
    resolveGitWorktreePaths: vi.fn(async () => ({})),
  };
});

import { createSandboxManager } from './sandboxManagerFactory.js';
import { NoopSandboxManager } from './sandboxManager.js';
import { ContainerSandboxManager } from '../sandbox/container/ContainerSandboxManager.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
import { resolveGitWorktreePaths } from '../sandbox/utils/fsUtils.js';
import type { SandboxRequest } from './sandboxManager.js';

const resolveGitWorktreePathsMock = vi.mocked(resolveGitWorktreePaths);

const WORKSPACE = path.resolve('/workspace');

function makeRequest(overrides: Partial<SandboxRequest> = {}): SandboxRequest {
  return {
    command: 'bash',
    args: ['-lc', 'echo hello'],
    cwd: WORKSPACE,
    env: { PATH: '/usr/bin' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveGitWorktreePathsMock.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSandboxManager', () => {
  it('returns NoopSandboxManager when sandboxing is disabled', () => {
    const manager = createSandboxManager(
      { enabled: false, command: 'docker' },
      { workspace: WORKSPACE },
    );
    expect(manager).toBeInstanceOf(NoopSandboxManager);
  });

  it.each([
    { platform: 'linux', expected: LinuxSandboxManager },
    { platform: 'darwin', expected: MacOsSandboxManager },
    { platform: 'win32', expected: WindowsSandboxManager },
  ] as const)(
    'falls back to the $platform manager when no command is configured',
    ({ platform, expected }) => {
      vi.spyOn(os, 'platform').mockReturnValue(platform);
      const manager = createSandboxManager(
        { enabled: true },
        { workspace: WORKSPACE },
      );
      expect(manager).toBeInstanceOf(expected);
    },
  );

  it('returns a ContainerSandboxManager for docker regardless of platform', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const manager = createSandboxManager(
      { enabled: true, command: 'docker', image: 'custom-sandbox:latest' },
      { workspace: WORKSPACE },
    );
    expect(manager).toBeInstanceOf(ContainerSandboxManager);
    expect(manager.getOptions()?.containerRuntime).toBe('docker');
    expect(manager.getOptions()?.containerImage).toBe('custom-sandbox:latest');
  });

  it.each(['docker', 'podman', 'runsc'] as const)(
    'activates containerized sandboxing for command %s',
    (command) => {
      const manager = createSandboxManager(
        { enabled: true, command },
        { workspace: WORKSPACE },
      );
      expect(manager).toBeInstanceOf(ContainerSandboxManager);
      expect(manager.getOptions()?.containerRuntime).toBe(command);
    },
  );

  it.each(['sandbox-exec', 'lxc', 'windows-native'] as const)(
    'does not treat %s as a container runtime',
    (command) => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      const manager = createSandboxManager(
        { enabled: true, command },
        { workspace: WORKSPACE },
      );
      expect(manager).toBeInstanceOf(LinuxSandboxManager);
    },
  );

  it('propagates container execution flags for a custom docker image', async () => {
    const manager = createSandboxManager(
      {
        enabled: true,
        command: 'docker',
        image: 'custom-sandbox:latest',
        includeDirectories: ['/extra'],
      },
      { workspace: WORKSPACE, includeDirectories: ['/extra'] },
    ) as ContainerSandboxManager;

    const prepared = await manager.prepareCommand(makeRequest());

    expect(prepared.program).toBe('docker');
    expect(prepared.args).toContain('run');
    expect(prepared.args).toContain('--rm');
    expect(prepared.args).toContain('--workdir');
    expect(prepared.args).toContain('/workspace');
    // The configured image is used instead of the default.
    expect(prepared.args).toContain('custom-sandbox:latest');
    expect(prepared.args).not.toContain('gemini-sandbox');
    // Workspace is bind-mounted at a stable in-container path.
    expect(prepared.args).toContain(`${WORKSPACE}:/workspace:ro`);
    // Network is denied unless explicitly allowed.
    expect(prepared.args).toContain('--network');
    expect(prepared.args[prepared.args.indexOf('--network') + 1]).toBe('none');
  });

  it('uses podman and grants network when networkAccess is set', async () => {
    const manager = createSandboxManager(
      {
        enabled: true,
        command: 'podman',
        image: 'custom-sandbox:latest',
        networkAccess: true,
      },
      { workspace: WORKSPACE },
    ) as ContainerSandboxManager;

    const prepared = await manager.prepareCommand(makeRequest());

    expect(prepared.program).toBe('podman');
    expect(prepared.args).not.toContain('--network');
  });

  it('drives runsc through docker with --runtime=runsc', async () => {
    const manager = createSandboxManager(
      { enabled: true, command: 'runsc', image: 'custom-sandbox:latest' },
      { workspace: WORKSPACE },
    ) as ContainerSandboxManager;

    const prepared = await manager.prepareCommand(makeRequest());

    expect(prepared.program).toBe('docker');
    expect(prepared.args).toContain('--runtime=runsc');
  });

  it('falls back to the default image when none is configured', () => {
    const manager = createSandboxManager(
      { enabled: true, command: 'docker' },
      { workspace: WORKSPACE },
    ) as ContainerSandboxManager;

    expect(manager.getContainerImage()).toBe('gemini-cli-sandbox');
  });
});
