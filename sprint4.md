# 📋 Sprint 4: Declarative Multi-Agent Review Council & Consensus Gate

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Autonomous Swarm Review, Declarative Manifests, Weighted
Consensus & Blocker Veto  
**Target Subsystems:** `packages/core/src/agents/`, `.gemini/agents/`  
**Reference:** [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
§4 (Custom Multi-Agent Council) & Figure 2

---

## 🎯 Sprint Goal

Implement the declarative multi-agent review council swarm. Allow repositories
to define specialist personas via JSON manifests in `.gemini/agents/*.json`.
Build the `CouncilOrchestrator` to execute parallel specialist evaluations using
Gemini 3.1 Pro Preview and Gemini 3.8 Flash, computing a weighted consensus
score (>=85/100) and enforcing blocker veto power before granting code write
permissions.

---

## 📂 Target Files & Subsystems

1. `.gemini/agents/product-owner.json` (New: Scope & ROI Guardian)
2. `.gemini/agents/tech-lead.json` (New: Architecture & SOLID Guardian)
3. `.gemini/agents/angular-expert.json` (New: Modern Angular Standards Guardian)
4. `.gemini/agents/bug-hunter.json` (New: Concurrency & Edge-Case Guardian)
5. `.gemini/agents/duplicate-finder.json` (New: AST DRY Similarity Guardian)
6. `packages/core/src/agents/types.ts` (New: Council Manifest & Review
   Interfaces)
7. `packages/core/src/agents/agentRegistry.ts` (New: Dynamic Manifest Discovery
   & Validation)
8. `packages/core/src/agents/councilOrchestrator.ts` (New: Parallel Review
   Dispatch & Consensus Engine)
9. `packages/core/src/agents/councilOrchestrator.test.ts` (Comprehensive Test
   Suite)

---

## 🔨 Step-by-Step Task Breakdown

### Task 4.1: Author Declarative Agent Manifests in `.gemini/agents/`

- **Context:** Specialists must not be hardcoded in TypeScript. They must be
  modular, declarative JSON files that can be committed per-repo.
- **Implementation:** Create the default 5 manifests in `.gemini/agents/`:
  1. `product-owner.json`:
     ```json
     {
       "id": "product-owner",
       "name": "Product Owner",
       "category": "business",
       "modelTier": "gemini-3.8-flash",
       "votingWeight": 3,
       "blockingPower": true,
       "enabled": true,
       "evalPrompt": "Audit proposed file changes against user requirement. Reject scope creep, unnecessary file mutations, or breaking API changes."
     }
     ```
  2. `tech-lead.json`:
     ```json
     {
       "id": "tech-lead",
       "name": "Tech Lead & Architect",
       "category": "architecture",
       "modelTier": "gemini-3.1-pro-preview",
       "votingWeight": 4,
       "blockingPower": true,
       "enabled": true,
       "evalPrompt": "Enforce SOLID principles, Single Responsibility, zero circular dependencies, high cohesion, and low coupling (<0.35 index)."
     }
     ```
  3. `angular-expert.json`:
     ```json
     {
       "id": "angular-expert",
       "name": "Angular Specialist",
       "category": "framework",
       "modelTier": "gemini-3.1-pro-preview",
       "votingWeight": 3,
       "blockingPower": true,
       "enabled": true,
       "evalPrompt": "Enforce Angular 19+ best practices: Standalone components, Signals for state, inject() syntax, OnPush change detection, and zero dangling RxJS subscriptions."
     }
     ```
  4. `bug-hunter.json`:
     ```json
     {
       "id": "bug-hunter",
       "name": "Bug & Race Condition Hunter",
       "category": "security",
       "modelTier": "gemini-3.1-pro-preview",
       "votingWeight": 4,
       "blockingPower": true,
       "enabled": true,
       "evalPrompt": "Identify missing null/undefined safety guards, unhandled Promise rejections, asynchronous race hazards, and resource leaks."
     }
     ```
  5. `duplicate-finder.json`:
     ```json
     {
       "id": "duplicate-finder",
       "name": "AST Duplicate Code Finder",
       "category": "refactor",
       "modelTier": "gemini-3.8-flash",
       "votingWeight": 2,
       "blockingPower": false,
       "enabled": true,
       "evalPrompt": "Scan modified AST symbols against existing repository helpers. Recommend importing existing functions instead of copying logic."
     }
     ```
- **Verification:** JSON schema validation asserting all manifests adhere to
  `AgentManifest` schema.

### Task 4.2: Implement `AgentRegistry`

- **Context:** Scans the active workspace `.gemini/agents/` directory, parses
  manifests, falls back to defaults if empty, and validates field types.
- **Implementation:**
  1. In `packages/core/src/agents/agentRegistry.ts`:
     - Implement `getActiveAgents(): Promise<AgentManifest[]>`.
     - Implement fallback `getDefaultAgents(): AgentManifest[]`.
     - Gracefully log and skip malformed JSON files without crashing.
- **Verification:** Unit test asserting workspace manifests override defaults.

### Task 4.3: Implement `CouncilOrchestrator`

- **Context:** Coordinates parallel evaluations using the Gemini API,
  calculating the weighted score and detecting blockers.
- **Implementation:**
  1. In `packages/core/src/agents/councilOrchestrator.ts`:
     - Dispatch all active agents in parallel via `Promise.allSettled`.
     - Use `gemini-3.1-pro-preview` for high reasoning agents and
       `gemini-3.8-flash` for rapid execution agents.
     - Structured output parsing:
       `{ score: number, passed: boolean, feedback: string, recommendedChanges: string[] }`.
- **Verification:** Unit test mocking Gemini API responses and asserting
  aggregated verdicts.

### Task 4.4: Weighted Consensus Scoring & Blocker Veto Enforcement

- **Context:** A passing verdict requires both an overall weighted score &ge;
  85/100 AND zero active blockers.
- **Implementation:**
  1. Implement formula:
     $$\text{OverallScore} = \frac{\sum (\text{Score}_i \times \text{Weight}_i)}{\sum \text{Weight}_i}$$
  2. If any agent with `blockingPower: true` returns `passed: false`, set
     `approved: false` regardless of the overall score.
  3. Package failure reasons into actionable `remediationDirectives` for the
     Coder agent.
- **Verification:** Test verifying that a score of 92/100 is REJECTED if
  `bug-hunter` triggers a blocker veto.

---

## 🧪 Verification & Acceptance Criteria

- [x] All 5 declarative agent manifests exist and pass schema validation.
- [x] `AgentRegistry` discovers and dynamically registers local manifests.
- [x] `CouncilOrchestrator` executes reviews concurrently without race
      conditions.
- [x] Veto authority strictly halts write permissions when blockers trigger.
- [x] All tests pass:
      `npm test -w @google/gemini-cli-core -- src/agents/councilOrchestrator.test.ts`.
