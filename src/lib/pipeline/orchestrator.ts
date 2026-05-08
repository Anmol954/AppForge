/**
 * Pipeline Orchestrator
 *
 * WHY: Individual stages are meaningless without coordination. The orchestrator
 * is the "driver program" of our compiler — it chains stages, handles failures,
 * manages retries, and produces the final PipelineResult with full metrics.
 *
 * DESIGN DECISIONS:
 * - Sequential execution: Each stage depends on the previous one's output.
 *   Parallelism would require restructuring the entire pipeline.
 * - Graceful degradation: If Stage 3 (Schema Gen) fails, we still produce
 *   the Intent and Architecture from stages 1-2, allowing partial results.
 * - Post-repair validation: After repair, we re-validate to ensure fixes worked.
 * - Max repair cycles: Prevent infinite repair loops (compiler must terminate).
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PipelineResult,
  StageResult,
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
  ValidationIssue,
  RepairAction,
} from './types';
import { extractIntent } from './intent';
import { planArchitecture } from './architecture';
import { generateSchemas } from './schema-gen';
import { validateSchemas } from './validator';
import { repairSchemas } from './repair';
import { simulateRuntime } from './runtime';

export interface CompileOptions {
  maxRepairCycles?: number;
  skipRepair?: boolean;
  skipValidation?: boolean;
  skipRuntime?: boolean;
}

const DEFAULT_OPTIONS: CompileOptions = {
  maxRepairCycles: 2,
  skipRepair: false,
  skipValidation: false,
  skipRuntime: false,
};

/**
 * Execute the full 6-stage compilation pipeline.
 *
 * Flow:
 * 1. Intent Extraction (LLM)
 * 2. Architecture Planning (LLM)
 * 3. Schema Generation (LLM)
 * 4. Cross-Layer Validation (pure logic)
 * 5. Repair & Regeneration (auto + LLM)
 * 6. Runtime Simulation (pure logic)
 */
export async function compilePipeline(
  prompt: string,
  options: CompileOptions = {}
): Promise<PipelineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const pipelineStart = Date.now();
  const stages: StageResult[] = [];
  const id = uuidv4();

  // ---- Stage 1: Intent Extraction ----
  let intent, architecture;
  let uiSchema: UISchema | undefined;
  let apiSchema: APISchema | undefined;
  let dbSchema: DBSchema | undefined;
  let authSchema: AuthSchema | undefined;
  let businessLogic: BusinessLogicSchema | undefined;
  let validationIssues: ValidationIssue[] = [];
  let repairActions: RepairAction[] = [];

  try {
    const stage1Result = await extractIntent(prompt);
    intent = stage1Result.intent;
    stages.push(stage1Result.stageResult);

    if (stage1Result.stageResult.status === 'failed') {
      return buildResult(id, prompt, intent, undefined, stages, [], [], pipelineStart, 'partial');
    }

    // ---- Stage 2: Architecture Planning ----
    const stage2Result = await planArchitecture(intent);
    architecture = stage2Result.architecture;
    stages.push(stage2Result.stageResult);

    if (stage2Result.stageResult.status === 'failed') {
      return buildResult(id, prompt, intent, architecture, stages, [], [], pipelineStart, 'partial');
    }

    // ---- Stage 3: Schema Generation ----
    const stage3Result = await generateSchemas(architecture, intent);
    uiSchema = stage3Result.uiSchema;
    apiSchema = stage3Result.apiSchema;
    dbSchema = stage3Result.dbSchema;
    authSchema = stage3Result.authSchema;
    businessLogic = stage3Result.businessLogic;
    stages.push(stage3Result.stageResult);

    if (stage3Result.stageResult.status === 'failed') {
      return buildResult(id, prompt, intent, architecture, stages, [], [], pipelineStart, 'partial');
    }
  } catch (error) {
    console.error('[Pipeline] Early failure:', error);
    return buildResult(id, prompt, intent, architecture, stages, [], [], pipelineStart, 'failed');
  }

  // ---- Stage 4: Cross-Layer Validation ----
  if (!opts.skipValidation && uiSchema && apiSchema && dbSchema && authSchema && businessLogic) {
    const schemas = { uiSchema, apiSchema, dbSchema, authSchema, businessLogic };
    const stage4Result = validateSchemas(schemas);
    validationIssues = stage4Result.issues;
    stages.push(stage4Result.stageResult);

    // ---- Stage 5: Repair & Regeneration ----
    const hasErrors = validationIssues.some((i) => i.severity === 'error');
    if (hasErrors && !opts.skipRepair) {
      let repairCycle = 0;
      let currentSchemas = schemas;

      while (repairCycle < opts.maxRepairCycles!) {
        repairCycle++;

        const stage5Result = await repairSchemas(currentSchemas, validationIssues);
        repairActions = stage5Result.repairActions;
        stages.push({
          ...stage5Result.stageResult,
          name: `Repair Cycle ${repairCycle}`,
        });

        // Re-validate after repair
        const revalidation = validateSchemas(stage5Result.schemas);
        const remainingErrors = revalidation.issues.filter((i) => i.severity === 'error');

        // Update schemas with repaired versions
        uiSchema = stage5Result.schemas.uiSchema;
        apiSchema = stage5Result.schemas.apiSchema;
        dbSchema = stage5Result.schemas.dbSchema;
        authSchema = stage5Result.schemas.authSchema;
        businessLogic = stage5Result.schemas.businessLogic;
        validationIssues = revalidation.issues;

        if (remainingErrors.length === 0) {
          // All errors fixed
          stages.push({
            stage: 4,
            name: 'Post-Repair Validation',
            status: 'success',
            output: { remainingIssues: revalidation.issues.length },
            errors: [],
            warnings: revalidation.issues.filter((i) => i.severity === 'warning').map((i) => i.description),
            latencyMs: revalidation.stageResult.latencyMs,
            tokenUsage: 0,
            retries: 0,
          });
          break;
        }

        if (repairCycle >= opts.maxRepairCycles!) {
          stages.push({
            stage: 4,
            name: `Post-Repair Validation (cycle ${repairCycle})`,
            status: 'failed',
            output: { remainingErrors: remainingErrors.length, repairedIssues: validationIssues.length - remainingErrors.length },
            errors: remainingErrors.map((i) => i.description),
            warnings: revalidation.issues.filter((i) => i.severity === 'warning').map((i) => i.description),
            latencyMs: revalidation.stageResult.latencyMs,
            tokenUsage: 0,
            retries: 0,
          });
        }

        currentSchemas = stage5Result.schemas;
      }
    } else {
      stages.push({
        stage: 5,
        name: 'Repair & Regeneration (skipped)',
        status: 'success',
        output: { reason: hasErrors ? 'Repair disabled by options' : 'No errors to repair' },
        errors: [],
        warnings: [],
        latencyMs: 0,
        tokenUsage: 0,
        retries: 0,
      });
    }
  }

  // ---- Stage 6: Runtime Simulation ----
  if (!opts.skipRuntime && uiSchema && apiSchema && dbSchema && authSchema && businessLogic) {
    const stage6Result = simulateRuntime({ uiSchema, apiSchema, dbSchema, authSchema, businessLogic });
    stages.push(stage6Result.stageResult);
  }

  const finalStatus = determineFinalStatus(stages);
  return buildResult(id, prompt, intent, architecture, stages, validationIssues, repairActions, pipelineStart, finalStatus, {
    uiSchema, apiSchema, dbSchema, authSchema, businessLogic,
  });
}

function buildResult(
  id: string,
  input: string,
  intent: any,
  architecture: any,
  stages: StageResult[],
  validationIssues: ValidationIssue[],
  repairActions: RepairAction[],
  startTime: number,
  finalStatus: 'success' | 'partial' | 'failed',
  schemas?: { uiSchema?: UISchema; apiSchema?: APISchema; dbSchema?: DBSchema; authSchema?: AuthSchema; businessLogic?: BusinessLogicSchema }
): PipelineResult {
  const totalTokens = stages.reduce((sum, s) => sum + s.tokenUsage, 0);
  const totalLatencyMs = Date.now() - startTime;

  return {
    id,
    input,
    intent,
    architecture,
    uiSchema: schemas?.uiSchema,
    apiSchema: schemas?.apiSchema,
    dbSchema: schemas?.dbSchema,
    authSchema: schemas?.authSchema,
    businessLogic: schemas?.businessLogic,
    validationIssues,
    repairActions,
    stages,
    finalStatus,
    totalLatencyMs,
    totalTokens,
    createdAt: new Date().toISOString(),
  };
}

function determineFinalStatus(stages: StageResult[]): 'success' | 'partial' | 'failed' {
  const hasFailure = stages.some((s) => s.status === 'failed');
  const allSuccess = stages.every((s) => s.status === 'success');
  const anyRepaired = stages.some((s) => s.status === 'repaired');

  if (allSuccess) return 'success';
  if (hasFailure && stages.length >= 3) return 'failed';
  if (anyRepaired) return 'success';
  return 'partial';
}
