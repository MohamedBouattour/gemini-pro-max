/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';

/**
 * Supported model families for tool definitions.
 */
export type ToolFamily = 'default-legacy' | 'gemini-3';

/**
 * Identifies the runtime implementation that backs a `grep_search` declaration.
 *
 * `GrepTool` and `RipGrepTool` intentionally expose the same public tool name
 * (`grep_search`) because they are interchangeable at the model level. Their
 * declarations therefore cannot be distinguished by name alone, and consumers
 * that need to reason about which schema was emitted must use this metadata.
 */
export type GrepImplementationVariant = 'legacy-regex' | 'native-ripgrep';

/**
 * Defines a tool's identity using a structured declaration.
 */
export interface ToolDefinition {
  /** The base declaration for the tool. */
  base: FunctionDeclaration;

  /**
   * Optional overrides for specific model families or versions.
   */
  overrides?: (modelId: string) => Partial<FunctionDeclaration> | undefined;

  /**
   * Local-only metadata describing the runtime implementation behind the
   * declaration. It is never sent to the model; it exists so declarations that
   * deliberately share a tool name can still be disambiguated.
   */
  implementationVariant?: GrepImplementationVariant;
}

/**
 * Explicit mapping of all core tools for a specific model family.
 */
export interface CoreToolSet {
  read_file: FunctionDeclaration;
  write_file: FunctionDeclaration;
  grep_search: FunctionDeclaration;
  grep_search_ripgrep: FunctionDeclaration;
  glob: FunctionDeclaration;
  list_directory: FunctionDeclaration;
  run_shell_command: (
    enableInteractiveShell: boolean,
    enableEfficiency: boolean,
    enableToolSandboxing: boolean,
  ) => FunctionDeclaration;
  replace: FunctionDeclaration;
  google_web_search: FunctionDeclaration;
  web_fetch: FunctionDeclaration;
  read_many_files: FunctionDeclaration;
  write_todos: FunctionDeclaration;
  get_internal_docs: FunctionDeclaration;
  ask_user: FunctionDeclaration;
  enter_plan_mode: FunctionDeclaration;
  exit_plan_mode: () => FunctionDeclaration;
  activate_skill: (skillNames: string[]) => FunctionDeclaration;
  read_mcp_resource: FunctionDeclaration;
  list_mcp_resources: FunctionDeclaration;
  update_topic?: FunctionDeclaration;
}
