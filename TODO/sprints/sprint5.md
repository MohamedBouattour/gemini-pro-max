# 📋 Sprint 5: Detached Execution Queue & Async Task Scheduling

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Concurrency Control, Detached Background Jobs, Job Telemetry
& `/jobs` Command  
**Target Subsystems:** `packages/core/src/scheduler/`,
`packages/core/src/services/`, `packages/cli/src/commands/`  
**Reference:** [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
§6 (Pillar 08: Detached Execution Queue)

---

## 🎯 Sprint Goal

Implement a high-throughput, non-blocking asynchronous execution queue. Throttle
concurrent worker tasks (default limit: 6x) using `Promise.allSettled`. Enable
long-running shell commands to run detached in the background with unique
`job_id` handles and disk log streaming. Provide interactive CLI commands
(`/jobs`) to inspect, tail, and cancel active jobs.

---

## 📂 Target Files & Subsystems

1. `packages/core/src/scheduler/executionQueue.ts` (New: Concurrency Limiter &
   Detached Job Manager)
2. `packages/core/src/scheduler/types.ts` (New: Background Job State Interfaces)
3. `packages/core/src/services/shellExecutionService.ts` (Support Detached
   Process Spawning)
4. `packages/core/src/core/turn.ts` (Integrate Execution Queue with Agent Turn
   Loop)
5. `packages/cli/src/commands/jobsCommand.ts` (New: Slash Command `/jobs`
   Handler)
6. `packages/core/src/scheduler/executionQueue.test.ts`

---

## 🔨 Step-by-Step Task Breakdown

### Task 5.1: Implement Concurrency-Throttled `ExecutionQueue`

- **Context:** Running dozens of subagent tasks or builds concurrently exhausts
  system file descriptors and CPU cores. The queue enforces a strict concurrency
  ceiling.
- **Implementation:**

  1. In `packages/core/src/scheduler/executionQueue.ts`:

     ```typescript
     export class ExecutionQueue {
       constructor(
         private readonly eventBus: EventBus,
         private readonly maxConcurrency: number = 6,
       ) {}

       async executeParallel<T, R>(
         items: T[],
         worker: (item: T) => Promise<R>,
       ): Promise<PromiseSettledResult<R>[]> {
         const results: PromiseSettledResult<R>[] = [];
         const executing: Promise<void>[] = [];

         for (const item of items) {
           const p = Promise.resolve()
             .then(() => worker(item))
             .then((val) => {
               results.push({ status: 'fulfilled', value: val });
             })
             .catch((err) => {
               results.push({ status: 'rejected', reason: err });
             });

           executing.push(p);

           if (executing.length >= this.maxConcurrency) {
             await Promise.race(executing);
           }
         }

         await Promise.all(executing);
         return results;
       }
     }
     ```

- **Verification:** Unit test asserting that when 20 jobs are enqueued with
  concurrency limit 4, at most 4 jobs execute simultaneously.

### Task 5.2: Support Detached Long-Running Background Jobs

- **Context:** Commands such as `npm run dev` or lengthy test suites should not
  block the main CLI interactive chat session.
- **Implementation:**
  1. In `packages/core/src/scheduler/executionQueue.ts`, implement
     `spawnDetachedJob()`:
     - Generate a cryptographically random `job_id` (e.g. `job_d7a8f1`).
     - Spawn child process with `detached: true` and redirect stdout/stderr to
       `.gemini/cache/artifacts/<job_id>.log`.
     - Return immediately to the user with the allocated `job_id` and artifact
       path.
     - Store process reference in an active job table.
- **Verification:** Test verifying that spawning a long command returns a
  `job_id` in <10ms while the process continues in the background.

### Task 5.3: Background Job State Machine

- **Context:** Jobs must transition through defined states with event emission:
  `QUEUED` &rarr; `RUNNING` &rarr; `COMPLETED` | `FAILED` | `CANCELLED`.
- **Implementation:**
  1. Add typed state machine:
     ```typescript
     export type JobStatus =
       | 'queued'
       | 'running'
       | 'completed'
       | 'failed'
       | 'cancelled';
     export interface BackgroundJob {
       id: string;
       command: string;
       cwd: string;
       startTime: number;
       endTime?: number;
       status: JobStatus;
       exitCode?: number;
       logFilePath: string;
     }
     ```
  2. Emit `job:state_changed` on the event bus upon any status transition.
- **Verification:** Test asserting state transitions and event bus
  notifications.

### Task 5.4: Implement `/jobs` CLI Slash Command

- **Context:** Developers need an interactive way to inspect background jobs
  without leaving the terminal UI.
- **Implementation:**
  1. Create `packages/cli/src/commands/jobsCommand.ts`:
     - `/jobs list`: Render tabular view of active and recent jobs (ID, command,
       elapsed time, status).
     - `/jobs logs <job_id>`: Tail the last 50 lines of the job's log artifact
       file.
     - `/jobs cancel <job_id>`: Terminate the background process via `SIGTERM` /
       `SIGKILL`.
  2. Register `/jobs` command in the CLI command dispatcher.
- **Verification:** Interactive CLI test simulating `/jobs list` and
  `/jobs cancel`.

### Task 5.5: Integrate with Turn Lifecycle

- **Context:** The main turn loop (`packages/core/src/core/turn.ts`) must inform
  the model of background job completions when synthesizing next steps.
- **Implementation:**
  1. Check for newly finished background jobs at the start of each turn.
  2. Inject finished job notifications into the assistant's context.
- **Verification:** Turn integration test verifying job completion notification
  delivery.

---

## 🧪 Verification & Acceptance Criteria

- [x] Concurrency limiter strictly caps parallel executions to configured
      threshold.
- [x] Detached jobs run non-blocking and output is streamed directly to
      `.gemini/cache/artifacts/`.
- [x] `/jobs` command accurately lists, tails, and cancels background tasks.
- [x] All scheduler tests pass:
      `npm test -w @google/gemini-cli-core -- src/scheduler/executionQueue.test.ts`.
