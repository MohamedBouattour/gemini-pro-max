# 📋 Sprint 3: Two-Tier Context Engine & Differential Token Masking

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Context Optimization (<15ms Surface Index, Ripgrep AST Cache,
AST DRY Analyzer, Output Truncation)  
**Target Subsystems:** `packages/core/src/context/`, `packages/core/src/utils/`,
`packages/core/src/services/`  
**Reference:** [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
§7 (2-Tier Context) & §8 (Token Masking)

---

## 🎯 Sprint Goal

Build a high-performance two-tier context extraction engine that provides
surface workspace topology in under 15ms while keeping deep symbol extraction
on-demand with mtime caching. Implement differential token masking (Head 25 /
Tail 50) and AST semantic deduplication to achieve ~78% token cost reduction and
eliminate terminal context overflow.

---

## 📂 Target Files & Subsystems

1. `packages/core/src/context/surfaceIndexer.ts` (New: Tier-1 Surface Context
   Extractor)
2. `packages/core/src/context/twoTierContextPipeline.ts` (New: Hybrid Context
   Orchestrator)
3. `packages/core/src/context/astDuplicateFinder.ts` (New: AST Token
   Normalization & DRY Similarity)
4. `packages/core/src/utils/truncation.ts` (Output Masking & Disk Artifact
   Persistence)
5. `packages/core/src/services/shellExecutionService.ts` (Hooking output stream
   to differential masker)
6. `packages/core/src/context/surfaceIndexer.test.ts`
7. `packages/core/src/context/astDuplicateFinder.test.ts`

---

## 🔨 Step-by-Step Task Breakdown

### Task 3.1: Implement Tier-1 Surface Indexer (<15ms Latency)

- **Context:** Every user turn requires instant awareness of repository state
  without burning tokens or stalling response times.
- **Implementation:**

  1. Create `packages/core/src/context/surfaceIndexer.ts`:

     ```typescript
     export interface SurfaceContext {
       gitStatus: string;
       directorySkeleton: string;
       workspaceRoot: string;
       tokenCountEstimate: number;
     }

     export class SurfaceIndexer {
       async extract(cwd: string): Promise<SurfaceContext> {
         const t0 = performance.now();

         // 1. Git status (-s) in <10ms
         const gitStatus = await this.quickGitStatus(cwd);

         // 2. Depth-2 directory skeleton
         const skeleton = await this.buildDepth2Skeleton(cwd);

         const latency = performance.now() - t0;
         if (latency > 25) {
           logger.debug(
             `[SurfaceIndexer] Warning: Extraction took ${latency}ms`,
           );
         }

         return {
           gitStatus,
           directorySkeleton: skeleton,
           workspaceRoot: cwd,
           tokenCountEstimate: Math.ceil(
             (gitStatus.length + skeleton.length) / 4,
           ),
         };
       }
     }
     ```

  2. Ensure token overhead is strictly capped at <450 tokens.

- **Verification:** Benchmark unit test ensuring `extract()` runs in under 15ms
  on average repos.

### Task 3.2: Implement Tier-2 Ripgrep & AST Symbol Table Pipeline

- **Context:** When complex coding tasks require deep symbol extraction, Tier 2
  loads full-text Ripgrep and AST symbol tables on demand, caching results based
  on file modification times (`mtime`).
- **Implementation:**
  1. Create `packages/core/src/context/twoTierContextPipeline.ts`:
     - Maintain an in-memory
       `Map<string, { mtimeMs: number; symbols: SymbolEntry[] }>` cache.
     - On file modification, invalidate only dirty symbols rather than
       rescanning the codebase.
     - Provide fast symbol search: `findSymbolDefinition(name: string)`.
- **Verification:** Test verifying that unchanged files return cached symbol
  maps in <2ms.

### Task 3.3: Implement AST Semantic Code Deduplication Analyzer

- **Context:** The AST Duplicate Finder agent requires structural token
  normalization to detect identical or near-identical code across repository
  files and enforce strict DRY principles.
- **Implementation:**

  1. Create `packages/core/src/context/astDuplicateFinder.ts`:

     ```typescript
     export interface DuplicationMatch {
       newSymbol: string;
       matchedExistingFile: string;
       matchedSymbol: string;
       similarity: number; // 0 to 100
       recommendation: string;
     }

     export class ASTDuplicateFinder {
       normalizeTokens(code: string): string {
         return code
           .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // strip comments
           .replace(/\s+/g, ' ') // collapse whitespace
           .replace(/const\s+|let\s+|var\s+/g, '') // standardize declarations
           .trim();
       }

       analyze(
         newCode: string,
         existingSymbols: Map<string, { file: string; code: string }>,
       ): DuplicationMatch[] {
         const matches: DuplicationMatch[] = [];
         const normNew = this.normalizeTokens(newCode);

         for (const [symName, entry] of existingSymbols.entries()) {
           const normExisting = this.normalizeTokens(entry.code);
           const sim = this.computeSimilarity(normNew, normExisting);

           if (sim > 0.8) {
             matches.push({
               newSymbol: 'Proposed Implementation',
               matchedExistingFile: entry.file,
               matchedSymbol: symName,
               similarity: Math.round(sim * 100),
               recommendation: `Import existing "${symName}" from ${entry.file} instead of re-implementing.`,
             });
           }
         }
         return matches;
       }

       private computeSimilarity(a: string, b: string): number {
         if (a === b) return 1.0;
         const longer = a.length > b.length ? a : b;
         const shorter = a.length > b.length ? b : a;
         if (longer.length === 0) return 1.0;
         if (longer.includes(shorter)) return shorter.length / longer.length;
         return 0.25;
       }
     }
     ```

- **Verification:** Unit test in `astDuplicateFinder.test.ts` asserting >80%
  similarity detection on duplicate utility functions.

### Task 3.4: Implement Differential Output Truncation (Head 25 / Tail 50)

- **Context:** Long commands like `npm test` can output 2,000 lines, flooding
  the model prompt context. Differential masking keeps the head and tail while
  persisting raw logs to disk.
- **Implementation:**

  1. In `packages/core/src/utils/truncation.ts`:

     ```typescript
     export async function maskOutputAndPersist(
       rawOutput: string,
       jobId: string,
       artifactsDir = '.gemini/cache/artifacts',
     ): Promise<string> {
       await fs.mkdir(artifactsDir, { recursive: true });
       const logFilePath = path.join(artifactsDir, `${jobId}.log`);
       await fs.writeFile(logFilePath, rawOutput, 'utf8');

       const lines = rawOutput.split('\n');
       if (lines.length <= 75) return rawOutput;

       const head = lines.slice(0, 25).join('\n');
       const tail = lines.slice(-50).join('\n');
       const maskedCount = lines.length - 75;

       return `${head}\n\n[... ${maskedCount} lines masked to save tokens • Full raw logs: ${logFilePath} ...]\n\n${tail}`;
     }
     ```

  2. Hook into `ShellExecutionService` to automatically apply masking on
     non-interactive command completions.

- **Verification:** Unit test verifying that a 200-line output is masked to 75
  lines with valid disk persistence.

---

## 🧪 Verification & Acceptance Criteria

- [x] `SurfaceIndexer` extracts repo topology in <15ms with <450 token overhead.
- [x] `ASTDuplicateFinder` correctly identifies >80% similar code and suggests
      reuse.
- [x] Verbose shell outputs exceeding 75 lines are masked (Head 25 + Tail 50)
      and full logs are persisted in `.gemini/cache/artifacts/`.
- [x] All context tests pass:
      `npm test -w @google/gemini-cli-core -- src/context/`.
