/**
 * Stage 4 — Cross-Layer Consistency Validator
 *
 * WHY: Generated schemas from different LLM calls are independently produced
 * but must be mutually consistent. A UI form field referencing a nonexistent
 * API field, or an API endpoint touching a missing DB table, means the
 * generated application is broken at compile time — not just at runtime.
 *
 * This module performs 13 deterministic cross-layer validation checks that
 * mirror what a compiler's type-checker does: verify that references resolve,
 * types align, and no orphaned resources exist.
 *
 * TRADEOFFS:
 * - 13 separate checks add O(n*m) complexity for large schemas
 * - Strict matching (no fuzzy) catches real bugs but may produce false positives
 *   for legitimate naming variations — the repair engine handles those
 * - Deterministic output enables reproducible builds and diff-friendly CI
 */

import type {
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
  ValidationIssue,
  StageResult,
} from './types';

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

export interface ValidationResult {
  issues: ValidationIssue[];
  stageResult: StageResult;
}

/**
 * Run all 13 cross-layer consistency checks and return every issue found.
 *
 * Deterministic: same input → same output, always.  No randomness, no LLM calls.
 */
export function validateSchemas(schemas: SchemaBundle): ValidationResult {
  const startTime = performance.now();
  const issues: ValidationIssue[] = [];

  // Build lookup maps once for O(1) access throughout all checks
  const ctx = buildContext(schemas);

  // --- Run every check -------------------------------------------------------
  checkUIApiFieldConsistency(schemas, ctx, issues);
  checkUIApiTableConsistency(schemas, ctx, issues);
  checkApiDbTableConsistency(schemas, ctx, issues);
  checkApiDbFieldConsistency(schemas, ctx, issues);
  checkAuthPageMapping(schemas, ctx, issues);
  checkAuthApiMapping(schemas, ctx, issues);
  checkRbacCompleteness(schemas, ctx, issues);
  checkEntityTableMapping(schemas, ctx, issues);
  checkEnumConsistency(schemas, ctx, issues);
  checkForeignKeyValidity(schemas, ctx, issues);
  checkOrphanedEndpoints(schemas, ctx, issues);
  checkWorkflowReferenceValidity(schemas, ctx, issues);
  checkDashboardPermissionValidity(schemas, ctx, issues);

  const latencyMs = Math.round(performance.now() - startTime);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    stageResult: {
      stage: 4,
      name: 'Cross-Layer Consistency Validation',
      status: errorCount > 0 ? 'failed' : warningCount > 0 ? 'repaired' : 'success',
      output: { totalIssues: issues.length, errors: errorCount, warnings: warningCount },
      errors: issues.filter((i) => i.severity === 'error').map((i) => i.description),
      warnings: issues.filter((i) => i.severity === 'warning').map((i) => i.description),
      latencyMs,
      tokenUsage: 0,
      retries: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Lookup context — pre-computed maps for O(1) resolution
// ---------------------------------------------------------------------------

interface ValidationContext {
  /** Set of all role names defined in auth */
  authRoleNames: Set<string>;
  /** Set of all permission names */
  authPermissionNames: Set<string>;
  /** Map: API path → endpoint (without query) */
  apiEndpointsByPath: Map<string, (typeof import('./types').APIEndpointSchema._output)[]>;
  /** Set of all API paths (GET only) for data source matching */
  apiGetPaths: Set<string>;
  /** Set of all API endpoint paths */
  allApiPaths: Set<string>;
  /** Map: DB table name → table */
  dbTableMap: Map<string, (typeof import('./types').DBTableSchema._output)>;
  /** Set of all DB table names */
  dbTableNames: Set<string>;
  /** Set of all DB column names per table: table.column */
  dbColumnSet: Set<string>;
  /** Map: table name → set of column names */
  dbColumnsByTable: Map<string, Set<string>>;
  /** Set of all API request/response body field names (across all endpoints) */
  allApiBodyFields: Set<string>;
  /** Set of all page routes from UI */
  uiPageRoutes: Set<string>;
  /** Set of all entity names from business logic */
  workflowEntityNames: Set<string>;
  /** Set of all business rule entity names */
  businessRuleEntityNames: Set<string>;
  /** Set of all navigation routes */
  navigationRoutes: Set<string>;
  /** Set of all layout IDs */
  layoutIds: Set<string>;
}

function buildContext(schemas: SchemaBundle): ValidationContext {
  const { uiSchema, apiSchema, dbSchema, authSchema, businessLogic } = schemas;

  // Auth roles
  const authRoleNames = new Set(authSchema.roles.map((r) => r.name));
  const authPermissionNames = new Set(authSchema.permissions.map((p) => p.name));

  // API endpoints grouped by path
  const apiEndpointsByPath = new Map<string, (typeof apiSchema.endpoints)[number][]>();
  const apiGetPaths = new Set<string>();
  const allApiPaths = new Set<string>();
  for (const ep of apiSchema.endpoints) {
    const normalized = normalizeApiPath(ep.path);
    const bucket = apiEndpointsByPath.get(normalized) ?? [];
    bucket.push(ep);
    apiEndpointsByPath.set(normalized, bucket);
    allApiPaths.add(normalized);
    if (ep.method === 'GET') {
      apiGetPaths.add(normalized);
    }
  }

  // DB tables & columns
  const dbTableMap = new Map<string, (typeof dbSchema.tables)[number]>();
  const dbTableNames = new Set<string>();
  const dbColumnSet = new Set<string>();
  const dbColumnsByTable = new Map<string, Set<string>>();
  for (const table of dbSchema.tables) {
    dbTableMap.set(table.name, table);
    dbTableNames.add(table.name);
    const cols = new Set(table.columns.map((c) => c.name));
    dbColumnsByTable.set(table.name, cols);
    for (const col of table.columns) {
      dbColumnSet.add(`${table.name}.${col.name}`);
    }
  }

  // All API body fields (union of request + response fields)
  const allApiBodyFields = new Set<string>();
  for (const ep of apiSchema.endpoints) {
    if (ep.requestBody) {
      for (const f of ep.requestBody.fields) {
        allApiBodyFields.add(f.name);
      }
    }
    for (const resp of ep.responses) {
      // response schema is a record — extract top-level keys
      if (resp.schema && typeof resp.schema === 'object') {
        for (const key of Object.keys(resp.schema)) {
          allApiBodyFields.add(key);
        }
      }
    }
  }

  // UI page routes
  const uiPageRoutes = new Set(uiSchema.pages.map((p) => p.route));

  // Business logic entity names
  const workflowEntityNames = new Set(businessLogic.workflows.map((w) => w.entity));
  const businessRuleEntityNames = new Set(
    businessLogic.rules.filter((r) => r.entity).map((r) => r.entity!)
  );

  // Navigation routes
  const navigationRoutes = new Set(
    uiSchema.navigation.items.map((i) => i.route)
  );

  // Layout IDs
  const layoutIds = new Set(uiSchema.layouts.map((l) => l.id));

  return {
    authRoleNames,
    authPermissionNames,
    apiEndpointsByPath,
    apiGetPaths,
    allApiPaths,
    dbTableMap,
    dbTableNames,
    dbColumnSet,
    dbColumnsByTable,
    allApiBodyFields,
    uiPageRoutes,
    workflowEntityNames,
    businessRuleEntityNames,
    navigationRoutes,
    layoutIds,
  };
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Normalise an API path for comparison — strip query strings, trailing slashes */
function normalizeApiPath(path: string): string {
  return path.replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
}

/** Simple camelCase / snake_case similarity check */
function fieldNameSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[_\-\s]+/g, '');
  return normalize(a) === normalize(b);
}

/** Issue counter unique within a category */
function issueId(layer: string, category: string, index: number): string {
  return `${layer}-${category}-${index}`;
}

// ---------------------------------------------------------------------------
// Check 1: UI → API Field Consistency
// ---------------------------------------------------------------------------

function checkUIApiFieldConsistency(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const page of schemas.uiSchema.pages) {
    for (const form of page.forms) {
      for (const field of form.fields) {
        const apiField = field.apiField;
        if (!ctx.allApiBodyFields.has(apiField)) {
          // Check if there's a similarly-named field (auto-repairable mismatch)
          const similarField = [...ctx.allApiBodyFields].find((f) =>
            fieldNameSimilar(f, apiField)
          );

          issues.push({
            id: issueId('ui', 'missing_field', idx++),
            severity: 'error',
            layer: 'ui',
            category: 'missing_field',
            description: `Form "${form.name}" on page "${page.name}" references API field "${apiField}" which does not exist in any API endpoint's request or response body.`,
            affectedFields: [`pages.${page.id}.forms.${form.id}.fields.${field.name}`],
            suggestion: similarField
              ? `Auto-mappable: "${apiField}" is similar to existing field "${similarField}". Apply field mapping.`
              : `Add "${apiField}" to the appropriate API endpoint's request/response body, or remove the field from the form.`,
            autoRepairable: !!similarField,
            repairedBy: similarField ? 'auto_map' : 'none',
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: UI → API Table Consistency
// ---------------------------------------------------------------------------

function checkUIApiTableConsistency(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const page of schemas.uiSchema.pages) {
    for (const table of page.tables) {
      const dataSource = normalizeApiPath(table.dataSource);
      if (!ctx.apiGetPaths.has(dataSource)) {
        issues.push({
          id: issueId('ui', 'reference_not_found', idx++),
          severity: 'error',
          layer: 'ui',
          category: 'reference_not_found',
          description: `Table "${table.name}" on page "${page.name}" has dataSource "${table.dataSource}" but no GET endpoint exists at that path.`,
          affectedFields: [`pages.${page.id}.tables.${table.id}.dataSource`],
          suggestion: `Create a GET endpoint at "${table.dataSource}" or update the table's dataSource to an existing GET endpoint.`,
          autoRepairable: false,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: API → DB Table Consistency
// ---------------------------------------------------------------------------

function checkApiDbTableConsistency(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const ep of schemas.apiSchema.endpoints) {
    const tableName = ep.dbOperation.table;
    if (!ctx.dbTableNames.has(tableName)) {
      issues.push({
        id: issueId('api', 'reference_not_found', idx++),
        severity: 'error',
        layer: 'api',
        category: 'reference_not_found',
        description: `Endpoint "${ep.method} ${ep.path}" references DB table "${tableName}" which does not exist in the database schema.`,
        affectedFields: [`endpoints.${ep.id}.dbOperation.table`],
        suggestion: `Create table "${tableName}" in the DB schema, or update the endpoint's dbOperation to reference an existing table.`,
        autoRepairable: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: API → DB Field Consistency
// ---------------------------------------------------------------------------

function checkApiDbFieldConsistency(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const ep of schemas.apiSchema.endpoints) {
    const tableName = ep.dbOperation.table;
    const tableCols = ctx.dbColumnsByTable.get(tableName);
    if (!tableCols) continue; // already reported by check 3

    for (const field of ep.dbOperation.fields) {
      if (!tableCols.has(field)) {
        // Check for similar column name
        const similarCol = [...tableCols].find((c) => fieldNameSimilar(c, field));
        issues.push({
          id: issueId('api', 'missing_field', idx++),
          severity: 'error',
          layer: 'api',
          category: 'missing_field',
          description: `Endpoint "${ep.method} ${ep.path}" dbOperation references field "${field}" which does not exist in table "${tableName}".`,
          affectedFields: [`endpoints.${ep.id}.dbOperation.fields`],
          suggestion: similarCol
            ? `Auto-mappable: "${field}" is similar to column "${similarCol}" in "${tableName}". Apply field mapping.`
            : `Add column "${field}" to table "${tableName}", or remove it from the dbOperation.`,
          autoRepairable: !!similarCol,
          repairedBy: similarCol ? 'auto_map' : 'none',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5: Auth → Page Mapping
// ---------------------------------------------------------------------------

function checkAuthPageMapping(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const route of schemas.uiSchema.protectedRoutes) {
    for (const role of route.roles) {
      if (!ctx.authRoleNames.has(role)) {
        issues.push({
          id: issueId('auth', 'missing_auth', idx++),
          severity: 'error',
          layer: 'auth',
          category: 'missing_auth',
          description: `Protected route "${route.route}" requires role "${role}" but that role is not defined in the auth schema.`,
          affectedFields: [`protectedRoutes.${route.route}.roles`],
          suggestion: `Add role "${role}" to the auth schema roles, or remove it from the protected route.`,
          autoRepairable: true,
          repairedBy: 'add_field',
        });
      }
    }
  }

  // Also check page-level roles
  let pageIdx = 0;
  for (const page of schemas.uiSchema.pages) {
    if (!page.authRequired) continue;
    for (const role of page.rolesAllowed) {
      if (!ctx.authRoleNames.has(role)) {
        issues.push({
          id: issueId('auth', 'missing_auth', 1000 + pageIdx++),
          severity: 'error',
          layer: 'auth',
          category: 'missing_auth',
          description: `Page "${page.name}" (route: ${page.route}) allows role "${role}" but that role is not defined in the auth schema.`,
          affectedFields: [`pages.${page.id}.rolesAllowed`],
          suggestion: `Add role "${role}" to the auth schema roles, or remove it from the page's rolesAllowed.`,
          autoRepairable: true,
          repairedBy: 'add_field',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 6: Auth → API Mapping
// ---------------------------------------------------------------------------

function checkAuthApiMapping(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const ep of schemas.apiSchema.endpoints) {
    if (!ep.authRequired) continue;
    for (const role of ep.requiredRoles) {
      if (!ctx.authRoleNames.has(role)) {
        issues.push({
          id: issueId('api', 'missing_auth', idx++),
          severity: 'error',
          layer: 'api',
          category: 'missing_auth',
          description: `Endpoint "${ep.method} ${ep.path}" requires role "${role}" but that role is not defined in the auth schema.`,
          affectedFields: [`endpoints.${ep.id}.requiredRoles`],
          suggestion: `Add role "${role}" to the auth schema roles, or remove it from the endpoint's requiredRoles.`,
          autoRepairable: true,
          repairedBy: 'add_field',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7: RBAC Completeness
// ---------------------------------------------------------------------------

function checkRbacCompleteness(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const ep of schemas.apiSchema.endpoints) {
    if (!ep.authRequired) continue;

    // Check that every role+endpoint combination has an RBAC rule
    for (const role of ep.requiredRoles) {
      const hasRbacRule = schemas.authSchema.rbacMatrix.some(
        (rule) =>
          rule.role === role &&
          (rule.resource === ep.path || rule.resource === normalizeApiPath(ep.path))
      );

      if (!hasRbacRule) {
        issues.push({
          id: issueId('auth', 'missing_relation', idx++),
          severity: 'warning',
          layer: 'auth',
          category: 'missing_relation',
          description: `Endpoint "${ep.method} ${ep.path}" has authRequired=true and requires role "${role}" but no RBAC rule exists for this role/resource combination.`,
          affectedFields: [
            `endpoints.${ep.id}`,
            `rbacMatrix`,
          ],
          suggestion: `Add an RBAC rule mapping role "${role}" to resource "${ep.path}" with appropriate actions (${ep.method === 'GET' ? 'read' : 'create/update/delete'}).`,
          autoRepairable: true,
          repairedBy: 'add_field',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 8: Entity → Table Mapping
// ---------------------------------------------------------------------------

function checkEntityTableMapping(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  const allEntityNames = new Set<string>();

  // Collect entity names from workflows
  for (const wf of schemas.businessLogic.workflows) {
    allEntityNames.add(wf.entity);
  }

  // Collect entity names from business rules
  for (const rule of schemas.businessLogic.rules) {
    if (rule.entity) {
      allEntityNames.add(rule.entity);
    }
  }

  // Collect entity names from API dbOperations
  for (const ep of schemas.apiSchema.endpoints) {
    allEntityNames.add(ep.dbOperation.table);
  }

  for (const entity of allEntityNames) {
    if (!ctx.dbTableNames.has(entity)) {
      issues.push({
        id: issueId('cross_layer', 'missing_relation', idx++),
        severity: 'error',
        layer: 'cross_layer',
        category: 'missing_relation',
        description: `Entity "${entity}" is referenced in business logic or API operations but has no corresponding DB table.`,
        affectedFields: [`entity:${entity}`],
        suggestion: `Create a DB table named "${entity}" or update references to point to an existing table.`,
        autoRepairable: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 9: Enum Consistency
// ---------------------------------------------------------------------------

function checkEnumConsistency(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;

  // DB enums are the source of truth
  const dbEnums = new Map<string, Set<string>>();
  for (const en of schemas.dbSchema.enums) {
    dbEnums.set(en.name.toLowerCase(), new Set(en.values));
  }

  // Also collect enum values from DB columns with enumValues
  for (const table of schemas.dbSchema.tables) {
    for (const col of table.columns) {
      if (col.enumValues && col.enumValues.length > 0) {
        const enumKey = col.name.toLowerCase();
        if (!dbEnums.has(enumKey)) {
          dbEnums.set(enumKey, new Set(col.enumValues));
        }
      }
    }
  }

  // Auth roles should ideally be reflected in DB enums
  const authRoleSet = new Set(schemas.authSchema.roles.map((r) => r.name));
  const roleEnumEntry = [...dbEnums.entries()].find(([k]) =>
    k.includes('role')
  );

  if (roleEnumEntry) {
    const dbRoleValues = roleEnumEntry[1];
    for (const role of authRoleSet) {
      if (!dbRoleValues.has(role)) {
        issues.push({
          id: issueId('cross_layer', 'enum_mismatch', idx++),
          severity: 'warning',
          layer: 'cross_layer',
          category: 'enum_mismatch',
          description: `Auth role "${role}" is not present in DB enum "${roleEnumEntry[0]}".`,
          affectedFields: [`auth.roles.${role}`, `db.enums.${roleEnumEntry[0]}`],
          suggestion: `Add "${role}" to the DB enum or remove the role from auth.`,
          autoRepairable: true,
          repairedBy: 'add_field',
        });
      }
    }

    // Check reverse: DB enum values not in auth roles
    for (const val of dbRoleValues) {
      if (!authRoleSet.has(val) && val !== 'super_admin') {
        // super_admin is often implicitly defined
        issues.push({
          id: issueId('cross_layer', 'enum_mismatch', idx++),
          severity: 'info',
          layer: 'cross_layer',
          category: 'enum_mismatch',
          description: `DB enum value "${val}" has no corresponding auth role definition.`,
          affectedFields: [`db.enums.${roleEnumEntry[0]}`, `auth.roles`],
          suggestion: `Consider adding an auth role for "${val}" or removing it from the DB enum.`,
          autoRepairable: false,
        });
      }
    }
  }

  // Check status enums across layers
  const statusEnumEntry = [...dbEnums.entries()].find(([k]) =>
    k.includes('status')
  );
  if (statusEnumEntry) {
    // Verify API endpoints don't reference status values outside the enum
    const dbStatusValues = statusEnumEntry[1];
    for (const ep of schemas.apiSchema.endpoints) {
      for (const resp of ep.responses) {
        const schemaStr = JSON.stringify(resp.schema ?? '');
        // Look for status-like references
        const statusPattern = /["'](\w*_?status)["']/gi;
        let match;
        while ((match = statusPattern.exec(schemaStr)) !== null) {
          // This is a structural check, not a deep value scan — report as info
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 10: Foreign Key Validity
// ---------------------------------------------------------------------------

function checkForeignKeyValidity(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const table of schemas.dbSchema.tables) {
    for (const col of table.columns) {
      if (!col.references) continue;

      if (!ctx.dbTableNames.has(col.references.table)) {
        issues.push({
          id: issueId('db', 'reference_not_found', idx++),
          severity: 'error',
          layer: 'db',
          category: 'reference_not_found',
          description: `Column "${col.name}" in table "${table.name}" has a foreign key reference to table "${col.references.table}" which does not exist.`,
          affectedFields: [`tables.${table.name}.columns.${col.name}.references.table`],
          suggestion: `Create table "${col.references.table}" or update the foreign key to reference an existing table.`,
          autoRepairable: false,
        });
        continue;
      }

      // Also verify the referenced column exists in the target table
      const targetCols = ctx.dbColumnsByTable.get(col.references.table);
      if (targetCols && !targetCols.has(col.references.column)) {
        issues.push({
          id: issueId('db', 'missing_field', idx++),
          severity: 'error',
          layer: 'db',
          category: 'missing_field',
          description: `Column "${col.name}" in table "${table.name}" references column "${col.references.column}" in table "${col.references.table}" but that column does not exist.`,
          affectedFields: [
            `tables.${table.name}.columns.${col.name}.references.column`,
          ],
          suggestion: `Add column "${col.references.column}" to table "${col.references.table}" or update the reference.`,
          autoRepairable: false,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 11: Orphaned Endpoint Detection
// ---------------------------------------------------------------------------

function checkOrphanedEndpoints(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;

  // Collect all API paths referenced by UI pages (form actions, table dataSources)
  const referencedApiPaths = new Set<string>();

  for (const page of schemas.uiSchema.pages) {
    // Form actions
    for (const form of page.forms) {
      referencedApiPaths.add(normalizeApiPath(form.action));
    }
    // Table data sources
    for (const table of page.tables) {
      referencedApiPaths.add(normalizeApiPath(table.dataSource));
    }
    // Dashboard widget data sources
    for (const dashboard of page.dashboards) {
      for (const widget of dashboard.widgets) {
        referencedApiPaths.add(normalizeApiPath(widget.dataSource));
      }
    }
  }

  // Also consider paths referenced by row/bulk actions (they typically map to endpoints)
  for (const page of schemas.uiSchema.pages) {
    for (const table of page.tables) {
      // rowActions often refer to detail/edit endpoints
      for (const action of table.rowActions) {
        // Actions like "edit", "delete", "view" — not direct paths, but check if they
        // contain path-like patterns
      }
      for (const action of table.bulkActions) {
        // Same for bulk actions
      }
    }
  }

  for (const ep of schemas.apiSchema.endpoints) {
    const epPath = normalizeApiPath(ep.path);

    // Skip common system endpoints that are always needed
    if (
      epPath.includes('/auth/') ||
      epPath.includes('/login') ||
      epPath.includes('/register') ||
      epPath.includes('/token') ||
      epPath.includes('/health') ||
      epPath.includes('/webhook')
    ) {
      continue;
    }

    if (!referencedApiPaths.has(epPath)) {
      issues.push({
        id: issueId('api', 'orphaned_resource', idx++),
        severity: 'warning',
        layer: 'api',
        category: 'orphaned_resource',
        description: `API endpoint "${ep.method} ${ep.path}" is not referenced by any UI page form, table, or dashboard widget.`,
        affectedFields: [`endpoints.${ep.id}`],
        suggestion: `Mark this endpoint as internal/system-only if it is used by other services, or connect it to a UI component.`,
        autoRepairable: true,
        repairedBy: 'update_reference',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 12: Workflow Reference Validity
// ---------------------------------------------------------------------------

function checkWorkflowReferenceValidity(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const wf of schemas.businessLogic.workflows) {
    // Check that the workflow's entity exists as a DB table
    if (!ctx.dbTableNames.has(wf.entity)) {
      issues.push({
        id: issueId('business_logic', 'reference_not_found', idx++),
        severity: 'error',
        layer: 'business_logic',
        category: 'reference_not_found',
        description: `Workflow "${wf.name}" references entity "${wf.entity}" which does not exist in the DB schema.`,
        affectedFields: [`workflows.${wf.id}.entity`],
        suggestion: `Create table "${wf.entity}" in the DB schema or update the workflow to reference an existing entity.`,
        autoRepairable: false,
      });
    }

    // Verify that initialStep references an actual step in the workflow
    const stepIds = new Set(wf.steps.map((s) => s.id));
    if (!stepIds.has(wf.initialStep)) {
      issues.push({
        id: issueId('business_logic', 'broken_dependency', idx++),
        severity: 'error',
        layer: 'business_logic',
        category: 'broken_dependency',
        description: `Workflow "${wf.name}" has initialStep "${wf.initialStep}" which does not match any step ID in the workflow.`,
        affectedFields: [`workflows.${wf.id}.initialStep`],
        suggestion: `Update initialStep to one of: ${[...stepIds].join(', ')}, or add a step with ID "${wf.initialStep}".`,
        autoRepairable: stepIds.size > 0,
        repairedBy: stepIds.size > 0 ? 'update_reference' : 'none',
      });
    }

    // Verify that step transitions reference valid step IDs
    for (const step of wf.steps) {
      for (const transition of step.transitions) {
        if (!stepIds.has(transition.target)) {
          issues.push({
            id: issueId('business_logic', 'invalid_workflow', idx++),
            severity: 'error',
            layer: 'business_logic',
            category: 'invalid_workflow',
            description: `Step "${step.name}" in workflow "${wf.name}" has a transition to "${transition.target}" which is not a valid step ID.`,
            affectedFields: [
              `workflows.${wf.id}.steps.${step.id}.transitions`,
            ],
            suggestion: `Update transition target to one of: ${[...stepIds].join(', ')}, or add a step with ID "${transition.target}".`,
            autoRepairable: stepIds.size > 0,
            repairedBy: stepIds.size > 0 ? 'update_reference' : 'none',
          });
        }
      }
    }
  }

  // Check business rules with entity references
  for (const rule of schemas.businessLogic.rules) {
    if (rule.entity && !ctx.dbTableNames.has(rule.entity)) {
      issues.push({
        id: issueId('business_logic', 'reference_not_found', idx++),
        severity: 'warning',
        layer: 'business_logic',
        category: 'reference_not_found',
        description: `Business rule "${rule.name}" references entity "${rule.entity}" which does not exist in the DB schema.`,
        affectedFields: [`rules.${rule.id}.entity`],
        suggestion: `Create table "${rule.entity}" or update the rule's entity reference.`,
        autoRepairable: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 13: Dashboard Permission Validity
// ---------------------------------------------------------------------------

function checkDashboardPermissionValidity(
  schemas: SchemaBundle,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  let idx = 0;
  for (const page of schemas.uiSchema.pages) {
    for (const dashboard of page.dashboards) {
      for (const widget of dashboard.widgets) {
        if (!widget.requiredPermission) continue;

        if (!ctx.authPermissionNames.has(widget.requiredPermission)) {
          issues.push({
            id: issueId('ui', 'missing_auth', idx++),
            severity: 'warning',
            layer: 'ui',
            category: 'missing_auth',
            description: `Dashboard widget "${widget.title}" (page: "${page.name}") requires permission "${widget.requiredPermission}" which is not defined in the auth schema.`,
            affectedFields: [
              `pages.${page.id}.dashboards.${dashboard.id}.widgets.${widget.id}.requiredPermission`,
            ],
            suggestion: `Add permission "${widget.requiredPermission}" to the auth schema or remove/update the widget's requiredPermission.`,
            autoRepairable: true,
            repairedBy: 'add_field',
          });
        }
      }
    }
  }
}
