# 📋 Sprint 6: Terminal UX (React Ink), DevTools Companion & Monorepo Validation

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Terminal Presentation, DevTools WebSocket Streaming, IDE
Pairing & Production Preflight  
**Target Subsystems:** `packages/cli/src/ui/`, `packages/devtools/`,
`packages/vscode-ide-companion/`  
**Reference:** [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
§1 (Dual-Plane Presentation) & §11 (Leadership Impact)

---

## 🎯 Sprint Goal

Integrate the multi-agent council, context engine, and execution queue into the
React Ink terminal UI with rich visual widgets (colored status badges, blocker
alerts, weighted consensus score gauge). Stream live telemetry over WebSockets
to the DevTools Companion Web UI (Port 4100) and VS Code extension. Execute a
complete monorepo preflight check (`npm run preflight`) to guarantee 100% test
passing, clean linting, and zero regressions.

---

## 📂 Target Files & Subsystems

1. `packages/cli/src/ui/CouncilVerdictView.tsx` (New: React Ink Council Review
   Presentation)
2. `packages/cli/src/ui/BackgroundJobsView.tsx` (New: Background Job Terminal
   Monitor)
3. `packages/cli/src/ui/AppContainer.tsx` (Wire Council & Jobs into main layout)
4. `packages/devtools/src/server.ts` (Stream Review Council events over
   WebSocket Port 4100)
5. `packages/vscode-ide-companion/src/diff-manager.ts` (Inject Council Review
   Verdicts into `gemini-diff://`)
6. Monorepo Verification Harness (`package.json`, `npm run preflight`)

---

## 🔨 Step-by-Step Task Breakdown

### Task 6.1: Build React Ink Council Verdict Component

- **Context:** When the Multi-Agent Council completes an evaluation, the
  terminal must display a clean, executive-level summary before prompting the
  user for confirmation.
- **Implementation:**
  1. Create `packages/cli/src/ui/CouncilVerdictView.tsx`:
     - Render overall consensus score with color-coding (Green &ge;85, Crimson
       <85).
     - Render individual specialist badges: PO, Tech Lead, Angular Specialist,
       Bug Hunter, Duplicate Finder.
     - Highlight blocker veto alerts prominently if an agent rejected the
       mutation.
     - Display actionable remediation feedback directives.
  2. Integrate component into `packages/cli/src/ui/AppContainer.tsx`.
- **Verification:** Component unit test with React Ink test renderer asserting
  correct ANSI colors and layout.

### Task 6.2: WebSocket Telemetry Streaming to DevTools (Port 4100)

- **Context:** The Companion Web UI on Port 4100 provides a graphical visualizer
  for DAG task waterfalls, agent debates, and active background jobs.
- **Implementation:**
  1. In `packages/devtools/src/server.ts`, broadcast council events:
     - `council:start`: Number of active agents.
     - `council:verdict`: Individual agent score, blocker status, and feedback.
     - `council:completed`: Overall consensus result.
     - `job:state_changed`: Live status of background execution queue tasks.
- **Verification:** Test verifying WebSocket message receipt on Port 4100.

### Task 6.3: VS Code Extension Virtual Diff Pairing

- **Context:** When reviewing diffs in VS Code companion mode
  (`gemini-diff://`), the top of the virtual diff document should display the
  Council's sign-off status.
- **Implementation:**
  1. In `packages/vscode-ide-companion/src/diff-manager.ts`:
     - Prepend virtual diff comments with Council consensus score and blocker
       status:
       ```typescript
       // [GEMINI COUNCIL SIGN-OFF]: 94/100 (APPROVED) • Zero Blockers
       // Tech Lead: PASS • Angular Specialist: PASS • Bug Hunter: PASS
       ```
- **Verification:** VS Code companion integration test verifying virtual
  document header injection.

### Task 6.4: Full Monorepo Preflight Execution

- **Context:** Ensure the entire monorepo builds, typechecks, lints, and passes
  all tests with zero errors.
- **Implementation:**
  1. Execute individual verification stages:
     ```bash
     npm run clean
     npm run build:all
     npm run lint
     npm run typecheck
     npm run test
     ```
  2. Execute the full preflight suite:
     ```bash
     npm run preflight
     ```
- **Verification:** Preflight completes with exit code 0.

### Task 6.5: Tech Lead Promotion Demo Verification

- **Context:** Final verification of the interactive portfolio and blueprint in
  [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html).
- **Implementation:**
  1. Verify browser rendering of `TODO/Architecture.html`.
  2. Test all interactive tabs, the live council review simulator, scenario
     switches, and SVG diagram responsiveness.
- **Verification:** Zero broken links, zero console errors, 100% interactive
  responsiveness.

---

## 🧪 Verification & Acceptance Criteria

- [x] React Ink TUI displays clear Council verdict widgets with color-coded
      badges and scores.
- [x] DevTools companion server on Port 4100 receives live WebSocket telemetry.
- [x] `npm run build:all` builds packages, sandbox, and VS Code companion
      without errors.
- [x] `npm run preflight` exits with code 0 across the entire monorepo.
- [x] Architecture blueprint in `TODO/Architecture.html` is verified and ready
      for promotion review.
