# 🚀 Gemini CLI Enterprise Evolution: Master Sprint Roadmap

**Project:** Gemini CLI Enterprise Swarm Harness & Repository Hardening  
**Target Architecture:**
[TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
&
[TODO/Repository-Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Repository-Architecture.html)  
**Version
Target:** v0.65.0-enterprise  
**Lead Architect:** Principal Engineering / Tech Lead Promotion Portfolio

---

## 🎯 Executive Overview & Roadmap Strategy

This document establishes the master multi-sprint implementation blueprint to
transform the Gemini CLI monorepo into an enterprise-grade autonomous
engineering harness while eliminating confirmed architectural defects.

The roadmap is decomposed into **6 focused, test-driven sprints**. Each sprint
addresses a self-contained layer of the architecture, follows strict dependency
sequencing, and provides explicit before/after file targets, code snippets, and
automated verification tests.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 1: Core Subsystem Hardening & Defect Elimination                        │
│ Fix inert sandbox, WebSearch context hole, WebFetch schema, SDK options & auth  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 2: Frontier Model Configuration & Dynamic Fallback Cascade              │
│ Operationalize Gemini 3.1 Pro, 3.8 Flash, Gemma 4 & 429 quota circuit breaker  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 3: Two-Tier Context Engine & Token Masking                              │
│ <15ms surface indexer, Ripgrep AST symbol cache, AST DRY deduplication         │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 4: Declarative Multi-Agent Review Council & Consensus Gate              │
│ .gemini/agents/*.json manifests, AgentRegistry, CouncilOrchestrator, veto gate │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 5: Detached Execution Queue & Async Background Scheduling               │
│ Promise.allSettled concurrency (6x), detached job IDs, /jobs slash commands   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SPRINT 6: Terminal UX (React Ink), DevTools Companion & Monorepo Validation    │
│ TUI Council badges, WebSocket telemetry (Port 4100), full monorepo preflight   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📅 Sprint Navigation & Detailed Deliverables

Click into any individual sprint document for complete step-by-step
instructions, file modifications, exact line numbers, and verification test
suites:

### 1. [Sprint 1: Core Subsystem Hardening & Critical Defect Elimination](file:///g:/WORK/gemini-pro-max/sprint1.md)

- **Goal:** Eradicate confirmed defects, type holes, and dead configuration
  documented in `Repository-Architecture.html` §12.
- **Key Fixes:**
  - Wire containerized sandbox commands (`SandboxConfig.command` & `.image`) in
    `sandboxManagerFactory.ts` & `shellExecutionService.ts`.
  - Fix type hole in `packages/core/src/tools/web-search.ts:250` bridging
    `Config` to `AgentLoopContext`.
  - Align `web_fetch` schema by formally declaring the `url?: string` parameter
    in tool sets.
  - Implement missing `timeoutSeconds` and `env` overrides in
    `packages/sdk/src/shell.ts`.
  - Wire configurable approval policy checks in `packages/sdk/src/session.ts`.
  - Eliminate hardcoded credentials (`valid-token`, `admin:password`) in
    `packages/a2a-server/src/http/app.ts`.
  - Disambiguate duplicate `grep_search` declarations and remove dead
    `Kind.SwitchMode`.
- **Verification:** `npm test -w @google/gemini-cli-core` &
  `npm test -w @google/gemini-cli-sdk`.

### 2. [Sprint 2: Frontier Model Configuration & Dynamic Fallback Cascade](file:///g:/WORK/gemini-pro-max/sprint2.md)

- **Goal:** Fully activate the Gemini 3.x stack (`gemini-3.1-pro-preview`,
  `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemma-4-31b-it`).
- **Key Features:**
  - Update `packages/core/src/config/models.ts` and `defaultModelConfigs.ts`
    with Gemini 3.x models and native `ThinkingLevel.HIGH`.
  - Implement real-time HTTP 429 (`RESOURCE_EXHAUSTED`) circuit breaker to
    auto-fallback from Pro to Flash without dropping conversational state.
  - Integrate Local Gemma model routing hooks (`gemma-4-31b-it` and
    `gemma-4-26b-a4b-it`) for offline edge execution.
  - Update settings schema and documentation in
    `packages/cli/src/config/settingsSchema.ts`.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/services/modelConfig.golden.test.ts`.

### 3. [Sprint 3: Two-Tier Context Engine & Differential Token Masking](file:///g:/WORK/gemini-pro-max/sprint3.md)

- **Goal:** Deliver sub-15ms surface context indexing and eliminate terminal
  token flooding.
- **Key Features:**
  - Implement Tier-1 Surface Indexer (`git status -s`, depth-2 directory
    skeleton, active root, <450 tokens, <15ms).
  - Implement Tier-2 On-Demand Ripgrep & AST Symbol Table parser with
    mtime-based incremental disk caching.
  - Implement `ASTDuplicateFinder` to compute code token similarity (>80%) and
    recommend shared utility extraction.
  - Implement Token Differential Masking (Head 25 / Tail 50 lines) with raw
    output logging to `.gemini/cache/artifacts/<job_id>.log`.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/context/astDuplicateFinder.test.ts`.

### 4. [Sprint 4: Declarative Multi-Agent Review Council & Consensus Gate](file:///g:/WORK/gemini-pro-max/sprint4.md)

- **Goal:** Implement the customizable multi-agent review council swarm
  (`.gemini/agents/*.json`) and blocker veto authority.
- **Key Features:**
  - Author declarative JSON manifests for 5 core specialist agents (Product
    Owner, Tech Lead, Angular Specialist, Bug & Race Hunter, AST Duplicate
    Finder).
  - Implement `AgentRegistry` (`packages/core/src/agents/agentRegistry.ts`) for
    dynamic workspace discovery and validation.
  - Implement `CouncilOrchestrator`
    (`packages/core/src/agents/councilOrchestrator.ts`) with parallel
    `Promise.allSettled` review execution.
  - Implement Weighted Consensus Gating (>=85/100 pass threshold, 0 blockers)
    with targeted auto-remediation directive generation.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/agents/councilOrchestrator.test.ts`.

### 5. [Sprint 5: Detached Execution Queue & Async Task Scheduling](file:///g:/WORK/gemini-pro-max/sprint5.md)

- **Goal:** Implement throttled parallel execution, detached background jobs,
  and non-blocking job monitoring.
- **Key Features:**
  - Implement `ExecutionQueue` in
    `packages/core/src/scheduler/executionQueue.ts` with configurable worker
    limit (default: 6).
  - Support detached process execution allocating unique `job_id` handles and
    streaming output to disk artifacts.
  - Implement slash command `/jobs` (list, inspect, tail, cancel background
    jobs).
  - Integrate execution queue with `packages/core/src/core/turn.ts` and
    `scheduler.ts`.
- **Verification:** Vitest concurrency stress tests and detached job lifecycle
  verification.

### 6. [Sprint 6: Terminal UX (React Ink), DevTools Companion & Monorepo Validation](file:///g:/WORK/gemini-pro-max/sprint6.md)

- **Goal:** Wire visual Council widgets into React Ink TUI and WebSocket
  DevTools (Port 4100), followed by monorepo preflight.
- **Key Features:**
  - Render colored Council verdict badges, blocker alerts, and score gauges in
    the React Ink terminal UI.
  - Broadcast real-time council events and background task waterfalls over
    WebSocket to `packages/devtools` (Port 4100).
  - Pair council verdicts with VS Code Companion extension diff reviews
    (`gemini-diff://`).
  - Execute full monorepo preflight validation (`npm run preflight`: clean,
    install, build, lint, typecheck, test).
- **Verification:** `npm run preflight` & `npm run test:e2e`.

---

## 🛠️ Execution Protocol (opencode CLI)

Per workspace protocol, each sprint file can be directly supplied to the
execution agent:

```bash
# Execute Sprint 1
opencode --context=sprint1.md

# Verify Sprint 1 Tests
npm test -w @google/gemini-cli-core

# Execute Sprint 2
opencode --context=sprint2.md
```

---

## 📊 Definition of Done (DoD) for the Entire Initiative

1. **Zero High/Medium Findings:** All confirmed defects from
   `Repository-Architecture.html` §12 are resolved and verified.
2. **Model Currency:** All model references default to Gemini 3.x
   (`gemini-3.1-pro-preview`, `gemini-3.8-flash`) with automated fallback
   cascading.
3. **Multi-Agent Gating:** Pull requests / mutations can be audited by the
   5-Agent Council with weighted scoring and blocker vetoes.
4. **Token Efficiency:** Verbose command outputs are masked to Head 25 / Tail 50
   lines; context caching achieves ~78% cost reduction.
5. **Monorepo Green:** `npm run preflight` passes with zero lint errors, zero
   type errors, and 100% test pass rate.
