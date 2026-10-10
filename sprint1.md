# 📋 Sprint 1: Core Subsystem Hardening & Critical Defect Elimination

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Architectural Defect Resolution, Type Safety & Boundary
Integrity  
**Target Subsystems:** `packages/core`, `packages/sdk`, `packages/a2a-server`  
**Reference:** [TODO/Repository-Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Repository-Architecture.html)
§12 (Findings, Risks & Observations)

---

## 🎯 Sprint Goal

Eradicate all 11 confirmed architectural defects, type holes, and dead
configurations documented in Section 12 of `Repository-Architecture.html`.
Ensure every package compiles cleanly, enforces strict typing across context
boundaries, and eliminates hardcoded credentials.

---

## 📂 Target Files & Subsystems

1. [packages/core/src/services/sandboxManagerFactory.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/sandboxManagerFactory.ts)
   (lines 22-42)
2. [packages/core/src/services/shellExecutionService.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/shellExecutionService.ts)
   (lines 538-549)
3. [packages/core/src/config/config.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/config/config.ts)
   (lines 529-542, 815)
4. [packages/core/src/tools/web-search.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/web-search.ts)
   (lines 75-85, 248-256)
5. [packages/core/src/tools/definitions/model-family-sets/default-legacy.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/definitions/model-family-sets/default-legacy.ts)
   (lines 133-185, 429-445)
6. [packages/core/src/tools/definitions/model-family-sets/gemini-3.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/definitions/model-family-sets/gemini-3.ts)
   (lines 412-426)
7. [packages/core/src/tools/tools.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/tools.ts)
   (lines 1116-1130)
8. [packages/sdk/src/shell.ts](file:///g:/WORK/gemini-pro-max/packages/sdk/src/shell.ts)
   (lines 31-86)
9. [packages/sdk/src/session.ts](file:///g:/WORK/gemini-pro-max/packages/sdk/src/session.ts)
   (lines 80-95)
10. [packages/a2a-server/src/http/app.ts](file:///g:/WORK/gemini-pro-max/packages/a2a-server/src/http/app.ts)
    (lines 96-123)

---

## 🔨 Step-by-Step Task Breakdown

### Task 1.1: Fix Inert Containerized Sandboxing Configuration

- **Defect:** `SandboxConfig.command` and `.image` are ignored by
  `createSandboxManager`. The factory selects purely by `os.platform()`, making
  containerized Docker/Podman sandboxing unreachable in production.
- **Implementation:**
  1. In
     [packages/core/src/services/sandboxManagerFactory.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/sandboxManagerFactory.ts#L22-L42),
     inspect `sandbox?.command` and `sandbox?.image`.
  2. If `sandbox?.command === 'docker'` or `sandbox?.command === 'podman'`,
     instantiate the container-aware sandbox manager or configure the options
     with the target container image.
  3. Ensure `packages/core/src/services/shellExecutionService.ts` respects the
     container sandbox manager when spawning commands.
- **Verification:** Unit test verifying that when
  `{ enabled: true, command: 'docker', image: 'custom-sandbox:latest' }` is
  passed, container execution flags are propagated.

### Task 1.2: Close Type Hole in `web-search.ts` Context Invocation

- **Defect:** `web-search.ts:250` passes `this.context.config` (a `Config`) into
  `WebSearchToolInvocation`, whose constructor expects `AgentLoopContext`. It
  compiled only because `Config` declares a loose `geminiClient!` property.
- **Implementation:**

  1. In
     [packages/core/src/tools/web-search.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/web-search.ts#L75-L85):

     ```typescript
     // Before
     class WebSearchToolInvocation extends BaseToolInvocation<WebSearchToolParams, WebSearchToolResult> {
       constructor(private readonly context: AgentLoopContext, ...)

     // After: Properly type the required capability interface or accept the full loop context
     export interface WebSearchContext {
       geminiClient: GeminiClient;
     }
     class WebSearchToolInvocation extends BaseToolInvocation<WebSearchToolParams, WebSearchToolResult> {
       constructor(private readonly searchContext: WebSearchContext, ...)
     ```

  2. In `createInvocation()`, pass `this.context` directly instead of drilling
     into `this.context.config`.

- **Verification:** TypeScript typecheck passes with strict null/type checks.

### Task 1.3: Align `web_fetch` Parameter Schema

- **Defect:** `web-fetch.ts:924` checks `params.url`, but the tool declaration
  schema in `default-legacy.ts` and `gemini-3.ts` only declares `prompt`. The
  model cannot see a parameter the tool honors.
- **Implementation:**
  1. In
     [packages/core/src/tools/definitions/model-family-sets/default-legacy.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/definitions/model-family-sets/default-legacy.ts#L430-L445)
     and
     [gemini-3.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/definitions/model-family-sets/gemini-3.ts#L412-L425):
     ```typescript
     [WEB_FETCH_PARAM_URL]: {
       description: 'Optional: The direct HTTP/HTTPS URL of the web page or document to fetch.',
       type: 'string',
     },
     ```
  2. Update tool definitions snapshots in `coreToolsModelSnapshots.test.ts`.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/tools/definitions/coreToolsModelSnapshots.test.ts`.

### Task 1.4: Disambiguate Duplicate `grep_search` Tool Declarations

- **Defect:** Both `GrepTool` and `RipGrepTool` define `name: GREP_TOOL_NAME` in
  `default-legacy.ts:134, :181`, causing potential name collisions in tool
  resolvers.
- **Implementation:**
  1. Add an explicit `implementationVariant` metadata field to differentiate
     legacy regex search from native ripgrep search.
  2. Ensure the tool registry selectively registers the active tool without
     schema collision.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/tools/grep.test.ts`.

### Task 1.5: Remove Dead `Kind.SwitchMode` Member

- **Defect:** `SwitchMode = 'switch_mode'` in
  `packages/core/src/tools/tools.ts:1116-1130` is dead code unused by any tool
  in the repository.
- **Implementation:**
  1. In
     [packages/core/src/tools/tools.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/tools/tools.ts),
     remove `SwitchMode` from `Kind` enum and deprecate if referenced in public
     headers.
- **Verification:** Full compile check across all packages (`npm run build`).

### Task 1.6: Implement SDK Shell Options (`timeoutSeconds` & `env`)

- **Defect:** `AgentShellOptions.timeoutSeconds` and `env` are declared in
  `packages/sdk/src/types.ts` but ignored in `SdkAgentShell.exec()`.
- **Implementation:**

  1. In
     [packages/sdk/src/shell.ts](file:///g:/WORK/gemini-pro-max/packages/sdk/src/shell.ts#L34-L75):

     ```typescript
     // Wire timeoutSeconds via AbortSignal.timeout
     let timeoutSignal: AbortSignal | undefined;
     if (options?.timeoutSeconds && options.timeoutSeconds > 0) {
       timeoutSignal = AbortSignal.timeout(options.timeoutSeconds * 1000);
     }

     // Merge custom environment variables into ShellExecutionConfig
     const shellConfig = {
       ...this.config.getShellExecutionConfig(),
       env: {
         ...process.env,
         ...options?.env,
       },
     };
     ```

- **Verification:** Unit test in `packages/sdk/src/shell.test.ts` verifying that
  commands abort when exceeding `timeoutSeconds` and that `options.env`
  variables appear in child processes.

### Task 1.7: Wire Policy Engine Approval Handler in SDK

- **Defect:** `packages/sdk/src/session.ts:89-93` hardcodes
  `PolicyDecision.ALLOW` with a `TODO`, leaving embedded agents without
  governance.
- **Implementation:**
  1. Extend `AgentSessionOptions` to accept an optional
     `onPolicyApproval?: (request: PolicyApprovalRequest) => Promise<boolean>`.
  2. When supplied, wire the callback into the session's `PolicyEngineConfig`.
- **Verification:** Test verifying that risky commands trigger the callback and
  fail when rejected.

### Task 1.8: Eliminate Hardcoded Credentials in A2A Server

- **Defect:** `packages/a2a-server/src/http/app.ts:96-123` contains literal
  credentials: `token === 'valid-token'` and `credentials === 'admin:password'`.
- **Implementation:**
  1. Replace hardcoded strings with environment variables:
     ```typescript
     const EXPECTED_BEARER_TOKEN =
       process.env.A2A_AUTH_TOKEN || (isDev ? 'dev-token' : undefined);
     const EXPECTED_BASIC_AUTH =
       process.env.A2A_BASIC_AUTH || (isDev ? 'admin:dev-password' : undefined);
     ```
  2. Emit a security warning if default dev tokens are used in production
     environments.
- **Verification:** Unit tests in `packages/a2a-server/src/http/app.test.ts`
  asserting rejection when invalid tokens are sent.

---

## 🧪 Verification & Acceptance Criteria

- [x] All 11 findings from `Repository-Architecture.html` §12 are resolved.
- [x] `npm run build` succeeds across all 7 workspace packages.
- [x] `npm test -w @google/gemini-cli-core` passes with 0 failures.
- [x] `npm test -w @google/gemini-cli-sdk` passes with 0 failures.
- [x] `npm test -w @google/gemini-cli-a2a-server` passes with 0 failures.
