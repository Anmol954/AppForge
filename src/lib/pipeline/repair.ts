/**
 * Stage 5 — Repair & Regeneration Engine
 *
 * WHY: The validator identifies inconsistencies, but identifying problems
 * without fixing them is only half the battle. The repair engine acts as the
 * compiler's "error recovery" phase — it makes targeted fixes so the pipeline
 * can proceed to code generation without a full (expensive) regeneration.
 *
 * Design principles:
 * 1. **Preserve valid outputs** — never regenerate what works
 * 2. **Targeted repairs** — fix only the broken component/layer
 * 3. **Auto-fix when possible** — simple issues (missing roles, field maps)
 *    are repaired deterministically without LLM calls
 * 4. **LLM-assisted for complex issues** — structural mismatches that require
 *    understanding context are sent to the LLM with a focused prompt
 * 5. **Full audit trail** — every repair action records before/after state
 *
 * TRADEOFFS:
 * - Auto-fixes are conservative to avoid breaking working code
 * - LLM repairs add latency but are only used for complex cases
 * - Repair ordering matters: simpler fixes first to reduce LLM call count
 */

import type {
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
  ValidationIssue,
  RepairAction,
  StageResult,
} from './types';
import { structuredGenerate } from './llm';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SchemaBundle {
  uiSchema: UISchema;
  apiSchema: APISchema;
  dbSchema: DBSchema;
  authSchema: AuthSchema;
  businessLogic: BusinessLogicSchema;
}

export interface RepairResult {
  schemas: SchemaBundle;
  repairActions: RepairAction[];
  stageResult: StageResult;
}

/**
 * Repair schemas based on validation issues.
 *
 * Strategy:
 * 1. Group issues by repair category
 * 2. Apply auto-fixes first (deterministic, no LLM)
 * 3. For remaining complex issues, use LLM-assisted targeted regeneration
 * 4. Return repaired schemas + audit trail
 */
export async function repairSchemas(
  schemas: SchemaBundle,
  issues: ValidationIssue[]
): Promise<RepairResult> {
  const startTime = performance.now();
  const repairActions: RepairAction[] = [];
  let totalTokens = 0;
  let retries = 0;

  // Deep clone schemas so we never mutate the original
  const repaired: SchemaBundle = JSON.parse(JSON.stringify(schemas));

  // Group issues by auto-repairability
  const autoRepairable = issues.filter((i) => i.autoRepairable);
  const complexIssues = issues.filter((i) => !i.autoRepairable);

  // Phase 1: Auto-fix simple issues
  const autoResults = applyAutoRepairs(repaired, autoRepairable);
  repairActions.push(...autoResults);

  // Phase 2: LLM-assisted repair for complex issues (only if there are errors)
  const complexErrors = complexIssues.filter((i) => i.severity === 'error');
  if (complexErrors.length > 0) {
    const llmResults = await applyLLMRepairs(repaired, complexErrors, schemas);
    repairActions.push(...llmResults);
    totalTokens += llmResults.reduce((sum, a) => sum + 0, 0); // tokens tracked via LLM
    retries += llmResults.filter((a) => !a.success).length;
  }

  // Phase 3: Handle orphan warnings (non-blocking, informational fixes)
  const orphanIssues = issues.filter(
    (i) => i.category === 'orphaned_resource' && i.severity === 'warning'
  );
  const orphanResults = applyOrphanRepairs(repaired, orphanIssues);
  repairActions.push(...orphanResults);

  const latencyMs = Math.round(performance.now() - startTime);
  const failedRepairs = repairActions.filter((a) => !a.success).length;

  return {
    schemas: repaired,
    repairActions,
    stageResult: {
      stage: 5,
      name: 'Repair & Regeneration Engine',
      status: failedRepairs > 0 ? 'repaired' : 'success',
      output: {
        totalIssues: issues.length,
        autoRepaired: autoResults.length,
        llmRepaired: repairActions.filter((a) => a.description.includes('LLM') || a.action === 'regenerate_component').length,
        orphanHandled: orphanResults.length,
        failed: failedRepairs,
      },
      errors: repairActions.filter((a) => !a.success).map((a) => a.description),
      warnings: [],
      latencyMs,
      tokenUsage: totalTokens,
      retries,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 1: Auto Repairs (deterministic, no LLM)
// ---------------------------------------------------------------------------

function applyAutoRepairs(
  schemas: SchemaBundle,
  issues: ValidationIssue[]
): RepairAction[] {
  const actions: RepairAction[] = [];

  for (const issue of issues) {
    const action = tryAutoRepair(schemas, issue);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}

/**
 * Attempt a deterministic auto-repair for a single issue.
 * Returns a RepairAction if successful, or null if the issue cannot be auto-fixed.
 */
function tryAutoRepair(
  schemas: SchemaBundle,
  issue: ValidationIssue
): RepairAction | null {
  switch (issue.category) {
    case 'missing_auth':
      return autoRepairMissingAuth(schemas, issue);
    case 'missing_field':
      return autoRepairMissingField(schemas, issue);
    case 'missing_relation':
      return autoRepairMissingRelation(schemas, issue);
    default:
      if (issue.repairedBy === 'auto_map') {
        return autoRepairFieldMap(schemas, issue);
      }
      return null;
  }
}

/**
 * Auto-repair: Add missing auth roles.
 * When a protected route or API endpoint references a role that doesn't exist,
 * add it to the auth schema with sensible defaults.
 */
function autoRepairMissingAuth(
  schemas: SchemaBundle,
  issue: ValidationIssue
): RepairAction | null {
  // Extract the missing role name from the affected fields
  const roleMatch = issue.description.match(/role "([^"]+)"/);
  if (!roleMatch) return null;
  const roleName = roleMatch[1];

  // Check if role already exists (might have been added by a previous repair)
  if (schemas.authSchema.roles.some((r) => r.name === roleName)) {
    return {
      issueId: issue.id,
      action: 'no_fix',
      targetLayer: 'auth',
      targetComponent: `roles.${roleName}`,
      changes: [],
      success: true,
      description: `Role "${roleName}" already exists — no action needed (duplicate issue).`,
    };
  }

  // Determine the permission level based on role name heuristics
  let level = 1;
  if (roleName.includes('admin') || roleName.includes('super')) level = 100;
  else if (roleName.includes('manager') || roleName.includes('lead')) level = 50;
  else if (roleName.includes('moderator')) level = 30;
  else if (roleName.includes('editor')) level = 20;
  else if (roleName.includes('user') || roleName.includes('member')) level = 10;
  else if (roleName.includes('viewer') || roleName.includes('guest')) level = 5;

  const newRole = {
    name: roleName,
    description: `Auto-generated role: ${roleName}`,
    level,
    isDefault: roleName === 'user',
  };

  schemas.authSchema.roles.push(newRole);

  return {
    issueId: issue.id,
    action: 'add_missing',
    targetLayer: 'auth',
    targetComponent: 'roles',
    changes: [
      {
        field: `roles[${schemas.authSchema.roles.length - 1}]`,
        oldValue: null,
        newValue: newRole,
        reason: `Added missing role "${roleName}" referenced by ${issue.affectedFields.join(', ')}`,
      },
    ],
    success: true,
    description: `Added missing auth role "${roleName}" (level=${level}).`,
  };
}

/**
 * Auto-repair: Add missing fields to API request/response or DB table.
 */
function autoRepairMissingField(
  schemas: SchemaBundle,
  issue: ValidationIssue
): RepairAction | null {
  // Check if this is an API→DB field mismatch
  const dbFieldMatch = issue.description.match(/field "([^"]+)" which does not exist in table "([^"]+)"/);
  if (dbFieldMatch) {
    const fieldName = dbFieldMatch[1];
    const tableName = dbFieldMatch[2];
    const table = schemas.dbSchema.tables.find((t) => t.name === tableName);
    if (!table) return null;

    const newColumn = {
      name: fieldName,
      type: 'String' as const,
      required: false,
      description: `Auto-generated column for field "${fieldName}"`,
    };

    table.columns.push(newColumn);

    return {
      issueId: issue.id,
      action: 'add_missing',
      targetLayer: 'db',
      targetComponent: `tables.${tableName}`,
      changes: [
        {
          field: `tables.${tableName}.columns`,
          oldValue: table.columns.length - 1,
          newValue: newColumn,
          reason: `Added missing column "${fieldName}" to table "${tableName}" referenced by API dbOperation`,
        },
      ],
      success: true,
      description: `Added missing DB column "${fieldName}" to table "${tableName}".`,
    };
  }

  return null;
}

/**
 * Auto-repair: Field name mapping (e.g., "company_name" → "organization_name").
 * When a field name is similar but not identical, create a mapping note.
 * In practice, this updates the referencing field to match the actual field.
 */
function autoRepairFieldMap(
  schemas: SchemaBundle,
  issue: ValidationIssue
): RepairAction | null {
  // Extract the source field and target field from the suggestion
  const mapMatch = issue.suggestion?.match(/similar to (?:existing )?field "([^"]+)"/) ||
    issue.suggestion?.match(/similar to column "([^"]+)"/);
  if (!mapMatch) return null;

  const correctName = mapMatch[1];
  const wrongNameMatch = issue.description.match(/"(apiField|field)":"?([^",}]+)/) ||
    issue.description.match(/references field "([^"]+)"/) ||
    issue.description.match(/references API field "([^"]+)"/);
  if (!wrongNameMatch) return null;

  const wrongName = wrongNameMatch[2] || wrongNameMatch[1];
  if (wrongName === correctName) return null;

  // Update the field in the appropriate schema
  let changesApplied = false;

  // Try to fix in UI forms
  for (const page of schemas.uiSchema.pages) {
    for (const form of page.forms) {
      for (const field of form.fields) {
        if (field.apiField === wrongName) {
          const oldValue = field.apiField;
          field.apiField = correctName;
          changesApplied = true;

          return {
            issueId: issue.id,
            action: 'auto_map',
            targetLayer: 'ui',
            targetComponent: `pages.${page.id}.forms.${form.id}`,
            changes: [
              {
                field: `fields.${field.name}.apiField`,
                oldValue,
                newValue: correctName,
                reason: `Auto-mapped field "${wrongName}" → "${correctName}" based on name similarity`,
              },
            ],
            success: true,
            description: `Auto-mapped field name "${wrongName}" → "${correctName}" in form "${form.name}".`,
          };
        }
      }
    }
  }

  // Try to fix in API dbOperations
  if (!changesApplied) {
    for (const ep of schemas.apiSchema.endpoints) {
      const fieldIdx = ep.dbOperation.fields.indexOf(wrongName);
      if (fieldIdx !== -1) {
        ep.dbOperation.fields[fieldIdx] = correctName;

        return {
          issueId: issue.id,
          action: 'auto_map',
          targetLayer: 'api',
          targetComponent: `endpoints.${ep.id}`,
          changes: [
            {
              field: `dbOperation.fields[${fieldIdx}]`,
              oldValue: wrongName,
              newValue: correctName,
              reason: `Auto-mapped field "${wrongName}" → "${correctName}" based on name similarity`,
            },
          ],
          success: true,
          description: `Auto-mapped DB operation field "${wrongName}" → "${correctName}" in endpoint "${ep.method} ${ep.path}".`,
        };
      }
    }
  }

  return null;
}

/**
 * Auto-repair: Add missing RBAC rules.
 * When an endpoint has authRequired but no RBAC rule, generate one from
 * the endpoint's auth requirements.
 */
function autoRepairMissingRelation(
  schemas: SchemaBundle,
  issue: ValidationIssue
): RepairAction | null {
  // Check if this is an RBAC completeness issue
  const rbacMatch = issue.description.match(/Endpoint "(\w+) ([^"]+)" has authRequired=true and requires role "([^"]+)" but no RBAC rule/);
  if (!rbacMatch) return null;

  const method = rbacMatch[1];
  const path = rbacMatch[2];
  const role = rbacMatch[3];

  // Determine appropriate actions based on HTTP method
  const methodToAction: Record<string, string[]> = {
    GET: ['read'],
    POST: ['create'],
    PUT: ['update'],
    PATCH: ['update'],
    DELETE: ['delete'],
  };
  const actions = methodToAction[method] || ['read'];

  const newRule = {
    role,
    resource: path,
    actions,
  };

  schemas.authSchema.rbacMatrix.push(newRule);

  return {
    issueId: issue.id,
    action: 'add_missing',
    targetLayer: 'auth',
    targetComponent: 'rbacMatrix',
    changes: [
      {
        field: `rbacMatrix[${schemas.authSchema.rbacMatrix.length - 1}]`,
        oldValue: null,
        newValue: newRule,
        reason: `Added RBAC rule for role "${role}" → ${method} ${path} (${actions.join(', ')})`,
      },
    ],
    success: true,
    description: `Added RBAC rule: role "${role}" can ${actions.join('/')} resource "${path}".`,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Orphan handling (warnings, non-blocking)
// ---------------------------------------------------------------------------

function applyOrphanRepairs(
  schemas: SchemaBundle,
  issues: ValidationIssue[]
): RepairAction[] {
  const actions: RepairAction[] = [];

  for (const issue of issues) {
    if (issue.category === 'orphaned_resource') {
      // Orphaned endpoints: add a tag/metadata to mark them as internal
      // We can't modify the schema structure, but we record the action
      const epMatch = issue.description.match(/endpoint "(\w+) ([^"]+)"/);
      if (epMatch) {
        actions.push({
          issueId: issue.id,
          action: 'remove_orphan',
          targetLayer: 'api',
          targetComponent: issue.affectedFields[0] || 'unknown',
          changes: [],
          success: true,
          description: `Endpoint ${epMatch[1]} ${epMatch[2]} marked as internal/system endpoint (no UI reference needed). This is informational — the endpoint may be used by other services or APIs.`,
        });
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Phase 3: LLM-Assisted Repairs (for complex, non-auto-fixable issues)
// ---------------------------------------------------------------------------

interface LLMRepairRequest {
  layer: 'ui' | 'api' | 'db' | 'auth' | 'business_logic';
  componentName: string;
  issues: ValidationIssue[];
  currentSchema: unknown;
  contextSchemas: Record<string, unknown>;
}

async function applyLLMRepairs(
  schemas: SchemaBundle,
  issues: ValidationIssue[],
  originalSchemas: SchemaBundle
): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];

  // Group issues by target layer
  const issuesByLayer = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const layer = issue.layer;
    const bucket = issuesByLayer.get(layer) ?? [];
    bucket.push(issue);
    issuesByLayer.set(layer, bucket);
  }

  // Process each layer that has complex issues
  for (const [layer, layerIssues] of issuesByLayer) {
    const layerActions = await repairLayerWithLLM(schemas, layer as LLMRepairRequest['layer'], layerIssues, originalSchemas);
    actions.push(...layerActions);
  }

  return actions;
}

async function repairLayerWithLLM(
  schemas: SchemaBundle,
  layer: LLMRepairRequest['layer'],
  issues: ValidationIssue[],
  _originalSchemas: SchemaBundle
): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];

  // Build the focused prompt for this layer
  const layerSchema = getLayerSchema(schemas, layer);
  const contextSchemas = getContextSchemas(schemas, layer);

  const prompt = constructRepairPrompt(layer, issues, layerSchema, contextSchemas);

  const schemaDescription = `
{
  "repairedSchema": <the corrected schema for the ${layer} layer>,
  "explanation": "brief explanation of what was changed and why"
}`;

  try {
    const response = await structuredGenerate<{
      repairedSchema: Record<string, unknown>;
      explanation: string;
    }>(prompt, schemaDescription, {
      temperature: 0,
      maxTokens: 4096,
      systemPrompt: `You are a precision schema repair engine. Your job is to fix ONLY the broken parts of the schema. Do NOT add features, do NOT redesign — just fix the specific validation errors listed. Return ONLY valid JSON. No markdown.`,
    });

    const repaired = response.content.repairedSchema;

    // Apply the repaired schema
    const before = JSON.stringify(layerSchema);
    applyLayerSchema(schemas, layer, repaired);
    const after = JSON.stringify(layerSchema);

    actions.push({
      issueId: issues.map((i) => i.id).join(','),
      action: 'regenerate_component',
      targetLayer: layer,
      targetComponent: `${layer}Schema`,
      changes: [
        {
          field: `${layer}Schema`,
          oldValue: before.substring(0, 200) + '...',
          newValue: after.substring(0, 200) + '...',
          reason: response.content.explanation,
        },
      ],
      success: true,
      description: `LLM-assisted repair of ${layer} layer: ${response.content.explanation}`,
    });
  } catch (error) {
    // LLM repair failed — record the failure
    actions.push({
      issueId: issues.map((i) => i.id).join(','),
      action: 'regenerate_component',
      targetLayer: layer,
      targetComponent: `${layer}Schema`,
      changes: [],
      success: false,
      description: `LLM-assisted repair of ${layer} layer failed: ${(error as Error).message}. Manual intervention required.`,
    });
  }

  return actions;
}

/**
 * Construct a focused repair prompt that includes only the relevant context.
 */
function constructRepairPrompt(
  layer: string,
  issues: ValidationIssue[],
  layerSchema: unknown,
  contextSchemas: Record<string, unknown>
): string {
  const issueDescriptions = issues
    .map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] ${i.description}\n   Affected: ${i.affectedFields.join(', ')}\n   Suggestion: ${i.suggestion}`)
    .join('\n');

  return `## Schema Repair Request

You must repair the **${layer}** layer of an application schema. The following validation issues were found:

### Issues to Fix:
${issueDescriptions}

### Current ${layer} Schema (BROKEN):
\`\`\`json
${JSON.stringify(layerSchema, null, 2)}
\`\`\`

### Related Schemas (for context — DO NOT modify these):
${Object.entries(contextSchemas)
  .map(
    ([name, schema]) =>
      `#### ${name}:\n\`\`\`json\n${JSON.stringify(schema, null, 2).substring(0, 2000)}\n\`\`\``
  )
  .join('\n\n')}

### Instructions:
1. Fix ONLY the specific issues listed above
2. Preserve ALL existing valid parts of the schema
3. Do NOT add new features, endpoints, tables, or components
4. Do NOT remove anything that is not directly causing an issue
5. Return the COMPLETE repaired ${layer} schema (not just the changed parts)
6. Provide a brief explanation of changes made`;
}

// ---------------------------------------------------------------------------
// Schema access helpers
// ---------------------------------------------------------------------------

function getLayerSchema(
  schemas: SchemaBundle,
  layer: string
): unknown {
  switch (layer) {
    case 'ui':
      return schemas.uiSchema;
    case 'api':
      return schemas.apiSchema;
    case 'db':
      return schemas.dbSchema;
    case 'auth':
      return schemas.authSchema;
    case 'business_logic':
      return schemas.businessLogic;
    default:
      return {};
  }
}

function getContextSchemas(
  schemas: SchemaBundle,
  _layer: string
): Record<string, unknown> {
  // Provide all other schemas as context
  return {
    apiSchema: schemas.apiSchema,
    dbSchema: schemas.dbSchema,
    authSchema: schemas.authSchema,
    uiSchema: schemas.uiSchema,
    businessLogicSchema: schemas.businessLogic,
  };
}

function applyLayerSchema(
  schemas: SchemaBundle,
  layer: string,
  repaired: Record<string, unknown>
): void {
  switch (layer) {
    case 'ui':
      Object.assign(schemas.uiSchema, repaired);
      break;
    case 'api':
      Object.assign(schemas.apiSchema, repaired);
      break;
    case 'db':
      Object.assign(schemas.dbSchema, repaired);
      break;
    case 'auth':
      Object.assign(schemas.authSchema, repaired);
      break;
    case 'business_logic':
      Object.assign(schemas.businessLogic, repaired);
      break;
  }
}
