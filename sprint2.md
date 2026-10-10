# 📋 Sprint 2: Frontier Model Configuration & Dynamic Fallback Cascade

**Parent Document:** [sprints.md](file:///g:/WORK/gemini-pro-max/sprints.md)  
**Primary Focus:** Gemini 3.x Model Stack, Thinking Engine & 429 Quota Circuit
Breakers  
**Target Subsystems:** `packages/core/src/config/`,
`packages/core/src/services/`, `packages/cli/src/config/`  
**Reference:** [TODO/Architecture.html](file:///g:/WORK/gemini-pro-max/TODO/Architecture.html)
§3 (Latest Gemini Models) & Figure 3 (Fallback Cascade)

---

## 🎯 Sprint Goal

Operationalize the complete Gemini 3.x production model stack across the
monorepo (`gemini-3.1-pro-preview`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`,
`gemma-4-31b-it`). Implement an autonomous 429 quota exhaustion circuit breaker
that dynamically cascades rate-limited requests from Pro to Flash without
dropping active session state.

---

## 📂 Target Files & Subsystems

1. [packages/core/src/config/models.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/config/models.ts)
   (lines 55-130, 200-250)
2. [packages/core/src/config/defaultModelConfigs.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/config/defaultModelConfigs.ts)
   (lines 65-155, 175-295)
3. [packages/core/src/services/modelConfigService.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/modelConfigService.ts)
4. [packages/core/src/availability/fallbackIntegration.test.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/availability/fallbackIntegration.test.ts)
5. [packages/core/src/services/modelConfig.golden.test.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/modelConfig.golden.test.ts)
6. [packages/cli/src/config/settingsSchema.ts](file:///g:/WORK/gemini-pro-max/packages/cli/src/config/settingsSchema.ts)
   (lines 1145-1250)

---

## 🔨 Step-by-Step Task Breakdown

### Task 2.1: Consolidate Gemini 3.x Model Constants & Enums

- **Context:** The CLI must recognize Gemini 3.1 Pro Preview as the frontier
  reasoning engine and Gemini 3.8 Flash as the primary execution engine.
- **Implementation:**
  1. In
     [packages/core/src/config/models.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/config/models.ts#L55-L130),
     verify and export:
     - `PREVIEW_GEMINI_3_1_MODEL = 'gemini-3.1-pro-preview'`
     - `PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL = 'gemini-3.1-pro-preview-customtools'`
     - `LATEST_GEMINI_FLASH_MODEL = 'gemini-3.8-flash'`
     - `BASE_GEMINI_FLASH_MODEL = 'gemini-3.5-flash'`
     - `LATEST_GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite'`
     - `GEMMA_4_31B_IT_MODEL = 'gemma-4-31b-it'`
     - `GEMMA_4_26B_A4B_IT_MODEL = 'gemma-4-26b-a4b-it'`
  2. Ensure `VALID_GEMINI_MODELS` includes the full 3.x suite.
- **Verification:**
  `npm test -w @google/gemini-cli-core -- src/config/models.test.ts`.

### Task 2.2: Configure Native Thinking Modes & Budgets

- **Context:** Gemini 3.x introduces native reasoning via `ThinkingLevel`. Pro
  models use `ThinkingLevel.HIGH`, while Flash uses configurable budgets to
  prevent runaway thinking loops.
- **Implementation:**
  1. In
     [packages/core/src/config/defaultModelConfigs.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/config/defaultModelConfigs.ts#L55-L95):
     ```typescript
     'chat-base-3': {
       extends: 'chat-base',
       modelConfig: {
         generateContentConfig: {
           thinkingConfig: {
             thinkingLevel: ThinkingLevel.HIGH,
           },
         },
       },
     },
     'gemini-3.8-flash': {
       extends: 'chat-base-3',
       modelConfig: {
         model: 'gemini-3.8-flash',
         generateContentConfig: {
           thinkingConfig: {
             thinkingBudget: 4096, // High throughput execution budget
           },
         },
       },
     },
     ```
  2. Set `DEFAULT_THINKING_MODE = 8192` as the safety ceiling across all utility
     chains.
- **Verification:** Assert generated content configs in
  `modelConfig.golden.test.ts` match snapshot thinking settings.

### Task 2.3: Implement Dynamic Quota (HTTP 429) Fallback Cascade

- **Context:** In enterprise environments, heavy usage of
  `gemini-3.1-pro-preview` can hit RPM or TPM limits (`RESOURCE_EXHAUSTED`). The
  turn must not fail; it must degrade gracefully to `gemini-3.8-flash`.
- **Implementation:**
  1. In
     [packages/core/src/services/modelConfigService.ts](file:///g:/WORK/gemini-pro-max/packages/core/src/services/modelConfigService.ts):
     ```typescript
     export class ModelConfigService {
       getNextFallbackModel(
         currentModelId: string,
         error?: unknown,
       ): string | null {
         if (isQuotaExhaustedError(error)) {
           if (
             currentModelId.includes('3.1-pro') ||
             currentModelId.includes('3-pro')
           ) {
             return LATEST_GEMINI_FLASH_MODEL; // gemini-3.8-flash
           }
           if (
             currentModelId.includes('3.8-flash') ||
             currentModelId.includes('3.5-flash')
           ) {
             return LATEST_GEMINI_FLASH_LITE_MODEL; // gemini-3.5-flash-lite
           }
         }
         return null;
       }
     }
     ```
  2. Wire fallback handling into `packages/core/src/core/geminiChat.ts` retry
     loop so conversation history is preserved across fallback switches.
- **Verification:** Integration test in `fallbackIntegration.test.ts` simulating
  a 429 error and asserting seamless completion via Gemini 3.8 Flash.

### Task 2.4: Enable Local Gemma Model Routing

- **Context:** Allow developers working offline or in air-gapped environments to
  route tasks to local Gemma models (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`) via
  local OpenAI/Ollama compatible endpoints.
- **Implementation:**
  1. Implement local endpoint resolution in
     `packages/core/src/services/localModelRouter.ts`.
  2. Support `--model gemma` and `--model gemma-4-31b-it` in CLI launcher.
- **Verification:** Mock test asserting request redirection to
  `http://localhost:11434/v1` when local model flag is enabled.

### Task 2.5: Synchronize CLI Settings Schema

- **Context:** The terminal UI and configuration parser must validate and
  autocomplete the new models without throwing schema warnings.
- **Implementation:**
  1. Update `packages/cli/src/config/settingsSchema.ts` lines 1150-1240 with the
     Gemini 3.x enum values, default fallbacks, and descriptions.
- **Verification:** `npm run typecheck` across both `packages/cli` and
  `packages/core`.

---

## 🧪 Verification & Acceptance Criteria

- [x] All Gemini 3.x models resolve cleanly via `resolveModel('auto')`,
      `resolveModel('pro')`, and `resolveModel('flash')`.
- [x] Golden tests
      (`npm test -w @google/gemini-cli-core -- src/services/modelConfig.golden.test.ts`)
      pass with 100% snapshot alignment.
- [x] 429 Quota fallback switches from Pro to Flash without dropping
      conversation turns.
- [x] `npm test -w @google/gemini-cli-core -- src/availability/fallbackIntegration.test.ts`
      passes.
