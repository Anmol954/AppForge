/**
 * Stage 6 — Runtime Simulation
 *
 * WHY: Even after validation and repair, we need to verify that the generated
 * schemas produce a runnable application. This module performs "dry-run"
 * checks — tracing execution paths through the schemas without running actual
 * code. It mirrors what a compiler's linker does: verify that all references
 * resolve at runtime, types are compatible, and execution flows are valid.
 *
 * The six checks simulate:
 * 1. API route compilation (REST conventions, no conflicts)
 * 2. DB query validation (tables/columns exist, operation types match HTTP methods)
 * 3. Auth flow (login → token → API access → permission check)
 * 4. Form submission flow (form → API call → DB operation)
 * 5. Page rendering (layouts, navigation items exist)
 * 6. Schema cross-compilation (all schemas serialize to valid JSON)
 *
 * TRADEOFFS:
 * - Simulation is a heuristic — it catches most issues but cannot guarantee
 *   runtime correctness (that requires actual code generation + tests)
 * - No actual HTTP/DB calls are made — purely static analysis
 * - Auth flow simulation is simplified (no crypto, no real JWT)
 */

import type {
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
  StageResult,
} from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RuntimeCheck {
  name: string;
  category:
    | 'api_routing'
    | 'db_queries'
    | 'auth_flow'
    | 'form_submission'
    | 'page_rendering'
    | 'schema_compilation';
  status: 'pass' | 'fail' | 'warning';
  details: string;
  simulatedOutput?: string;
}

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

export interface SimulationResult {
  stageResult: StageResult;
  simulationResults: RuntimeCheck[];
}

/**
 * Run all 6 runtime simulation checks against the schema bundle.
 * Pure logic — no side effects, no LLM calls, deterministic.
 */
export function simulateRuntime(schemas: SchemaBundle): SimulationResult {
  const startTime = performance.now();
  const simulationResults: RuntimeCheck[] = [];

  // Run all checks
  simulationResults.push(checkApiRouteCompilation(schemas));
  simulationResults.push(checkDbQueryValidation(schemas));
  simulationResults.push(checkAuthFlowSimulation(schemas));
  simulationResults.push(checkFormSubmissionFlow(schemas));
  simulationResults.push(checkPageRendering(schemas));
  simulationResults.push(checkSchemaCrossCompilation(schemas));

  const latencyMs = Math.round(performance.now() - startTime);
  const failures = simulationResults.filter((r) => r.status === 'fail').length;
  const warnings = simulationResults.filter((r) => r.status === 'warning').length;

  return {
    stageResult: {
      stage: 6,
      name: 'Runtime Simulation',
      status: failures > 0 ? 'failed' : warnings > 0 ? 'repaired' : 'success',
      output: {
        totalChecks: simulationResults.length,
        passed: simulationResults.filter((r) => r.status === 'pass').length,
        failed: failures,
        warnings,
      },
      errors: simulationResults
        .filter((r) => r.status === 'fail')
        .map((r) => `${r.name}: ${r.details}`),
      warnings: simulationResults
        .filter((r) => r.status === 'warning')
        .map((r) => `${r.name}: ${r.details}`),
      latencyMs,
      tokenUsage: 0,
      retries: 0,
    },
    simulationResults,
  };
}

// ---------------------------------------------------------------------------
// Check 1: API Route Compilation
// ---------------------------------------------------------------------------

function checkApiRouteCompilation(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];
  const basePath = schemas.apiSchema.basePath;
  const validMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

  // Verify base path is well-formed
  if (!basePath.startsWith('/')) {
    issues.push(`Base path "${basePath}" does not start with "/"`);
  }

  // Track paths for conflict detection
  const pathMethodMap = new Map<string, Set<string>>();

  for (const ep of schemas.apiSchema.endpoints) {
    // Validate HTTP method
    if (!validMethods.has(ep.method)) {
      issues.push(`Endpoint ${ep.id}: Invalid HTTP method "${ep.method}"`);
    }

    // Validate path format
    const fullPath = `${basePath}${ep.path}`;
    if (!fullPath.startsWith('/')) {
      issues.push(`Endpoint ${ep.id}: Full path "${fullPath}" does not start with "/"`);
    }

    // REST convention checks
    if (ep.method === 'POST' && !ep.requestBody) {
      issues.push(
        `Endpoint ${ep.id} (${ep.method} ${ep.path}): POST endpoint has no request body defined`
      );
    }

    if (ep.method === 'GET' && ep.requestBody && ep.requestBody.fields.length > 0) {
      issues.push(
        `Endpoint ${ep.id} (${ep.method} ${ep.path}): GET endpoint should not have a request body (use query params instead)`
      );
    }

    if (ep.method === 'DELETE' && ep.dbOperation.type !== 'DELETE') {
      // Warning: DELETE method should typically map to DELETE operation
      // This is a soft check — some APIs use soft deletes via UPDATE
    }

    // Detect path+method conflicts
    const key = `${ep.method} ${fullPath}`;
    const existing = pathMethodMap.get(fullPath);
    if (existing && existing.has(ep.method)) {
      issues.push(`Duplicate endpoint: ${key}`);
    }
    const methodSet = pathMethodMap.get(fullPath) ?? new Set();
    methodSet.add(ep.method);
    pathMethodMap.set(fullPath, methodSet);

    // Validate path parameter format
    const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map((p) =>
      p.replace(/[{}]/g, '')
    );
    const definedParams = ep.params.filter((p) => p.in === 'path');
    for (const pp of pathParams) {
      if (!definedParams.some((dp) => dp.name === pp)) {
        issues.push(
          `Endpoint ${ep.id}: Path parameter "{${pp}}" is not defined in params`
        );
      }
    }
    for (const dp of definedParams) {
      if (!pathParams.includes(dp.name)) {
        issues.push(
          `Endpoint ${ep.id}: Path param "${dp.name}" defined but not present in path template`
        );
      }
    }

    // Validate response codes
    if (ep.responses.length === 0) {
      issues.push(`Endpoint ${ep.id}: No response definitions`);
    }
    const hasSuccess = ep.responses.some(
      (r) => r.statusCode >= 200 && r.statusCode < 300
    );
    if (!hasSuccess) {
      issues.push(`Endpoint ${ep.id}: No 2xx success response defined`);
    }
  }

  // Check for GET endpoints with pagination that reference data
  const getWithPagination = schemas.apiSchema.endpoints.filter(
    (ep) => ep.method === 'GET' && ep.pagination?.supported
  );
  for (const ep of getWithPagination) {
    if (ep.pagination && ep.pagination.defaultLimit > ep.pagination.maxLimit) {
      issues.push(
        `Endpoint ${ep.id}: defaultLimit (${ep.pagination.defaultLimit}) > maxLimit (${ep.pagination.maxLimit})`
      );
    }
  }

  const status: RuntimeCheck['status'] = issues.length > 0 ? 'fail' : 'pass';
  const endpointCount = schemas.apiSchema.endpoints.length;
  const pathCount = pathMethodMap.size;

  return {
    name: 'API Route Compilation',
    category: 'api_routing',
    status,
    details:
      issues.length > 0
        ? `Found ${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `All ${endpointCount} endpoints across ${pathCount} unique paths compile successfully. REST conventions validated.`,
    simulatedOutput:
      status === 'pass'
        ? `✓ ${endpointCount} routes registered | ✓ Base path: ${basePath} | ✓ No conflicts detected`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Check 2: DB Query Validation
// ---------------------------------------------------------------------------

function checkDbQueryValidation(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];
  const dbTableNames = new Set(schemas.dbSchema.tables.map((t) => t.name));
  const dbColumnsByTable = new Map<string, Set<string>>();
  for (const table of schemas.dbSchema.tables) {
    dbColumnsByTable.set(table.name, new Set(table.columns.map((c) => c.name)));
  }

  // Validate operation type ↔ HTTP method alignment
  const methodOperationMap: Record<string, Set<string>> = {
    GET: new Set(['SELECT', 'JOIN']),
    POST: new Set(['INSERT']),
    PUT: new Set(['UPDATE']),
    PATCH: new Set(['UPDATE']),
    DELETE: new Set(['DELETE']),
  };

  for (const ep of schemas.apiSchema.endpoints) {
    const { table, type: opType, fields } = ep.dbOperation;

    // Table existence
    if (!dbTableNames.has(table)) {
      issues.push(
        `Endpoint ${ep.id}: dbOperation references non-existent table "${table}"`
      );
      continue;
    }

    // Operation type ↔ HTTP method
    const allowedOps = methodOperationMap[ep.method];
    if (allowedOps && !allowedOps.has(opType)) {
      // Some operations are valid cross-method (e.g., soft delete via UPDATE)
      if (!(ep.method === 'DELETE' && opType === 'UPDATE')) {
        issues.push(
          `Endpoint ${ep.id}: HTTP ${ep.method} paired with DB operation ${opType} — expected one of: ${[...allowedOps].join(', ')}`
        );
      }
    }

    // Field existence
    const tableCols = dbColumnsByTable.get(table)!;
    for (const field of fields) {
      if (!tableCols.has(field)) {
        issues.push(
          `Endpoint ${ep.id}: dbOperation field "${field}" does not exist in table "${table}"`
        );
      }
    }

    // SELECT without fields — might be intentional (SELECT *)
    if (opType === 'SELECT' && fields.length === 0) {
      issues.push(
        `Endpoint ${ep.id}: SELECT operation has no fields specified — use explicit field list for performance`
      );
    }

    // INSERT without fields
    if (opType === 'INSERT' && fields.length === 0 && ep.requestBody) {
      issues.push(
        `Endpoint ${ep.id}: INSERT operation has no fields but request body is defined — fields should map to body`
      );
    }
  }

  // Validate DB-level constraints
  for (const table of schemas.dbSchema.tables) {
    // Check that indexed columns actually exist
    for (const idx of table.indexes) {
      const tableCols = dbColumnsByTable.get(table.name)!;
      for (const col of idx.columns) {
        if (!tableCols.has(col)) {
          issues.push(
            `Table "${table.name}": Index "${idx.name}" references non-existent column "${col}"`
          );
        }
      }
    }

    // Check primary key constraint
    const hasPkConstraint = table.constraints.some(
      (c) => c.type === 'PRIMARY_KEY'
    );
    const hasIdColumn = table.columns.some((c) => c.name === 'id');
    if (!hasPkConstraint && !hasIdColumn) {
      issues.push(
        `Table "${table.name}": No PRIMARY_KEY constraint and no "id" column found`
      );
    }
  }

  // Check foreign key references resolve to valid columns
  for (const table of schemas.dbSchema.tables) {
    for (const col of table.columns) {
      if (!col.references) continue;
      if (!dbTableNames.has(col.references.table)) {
        issues.push(
          `Table "${table.name}": Column "${col.name}" has FK to non-existent table "${col.references.table}"`
        );
        continue;
      }
      const targetCols = dbColumnsByTable.get(col.references.table);
      if (targetCols && !targetCols.has(col.references.column)) {
        issues.push(
          `Table "${table.name}": Column "${col.name}" FK references non-existent column "${col.references.column}" in "${col.references.table}"`
        );
      }
    }
  }

  const status: RuntimeCheck['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    name: 'DB Query Validation',
    category: 'db_queries',
    status,
    details:
      issues.length > 0
        ? `Found ${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `All ${schemas.apiSchema.endpoints.length} DB operations validated against ${schemas.dbSchema.tables.length} tables. Operation types align with HTTP methods.`,
    simulatedOutput:
      status === 'pass'
        ? `✓ ${schemas.dbSchema.tables.length} tables | ✓ ${schemas.apiSchema.endpoints.length} operations | ✓ All FKs valid`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Check 3: Auth Flow Simulation
// ---------------------------------------------------------------------------

function checkAuthFlowSimulation(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];

  // Step 1: Check auth strategy is configured
  const strategy = schemas.authSchema.strategy;
  const validStrategies = ['jwt', 'session', 'oauth', 'magic_link', 'api_key'];
  if (!validStrategies.includes(strategy)) {
    issues.push(`Invalid auth strategy: "${strategy}"`);
  }

  // Step 2: Check session config
  const sessionConfig = schemas.authSchema.sessionConfig;
  if (!sessionConfig.tokenExpiry || sessionConfig.tokenExpiry === '0') {
    issues.push('Token expiry is not configured or set to 0');
  }
  if (sessionConfig.secure === false) {
    issues.push(
      'Session secure flag is false — tokens may be transmitted over insecure connections'
    );
  }

  // Step 3: Check password policy
  const pp = schemas.authSchema.passwordPolicy;
  if (pp.minLength < 8) {
    issues.push(
      `Password minimum length (${pp.minLength}) is below recommended minimum of 8`
    );
  }

  // Step 4: Simulate role hierarchy
  const roles = schemas.authSchema.roles;
  if (roles.length === 0) {
    issues.push('No auth roles defined — all endpoints would be inaccessible');
  }
  const hasDefaultRole = roles.some((r) => r.isDefault);
  if (!hasDefaultRole) {
    issues.push(
      'No default role defined — new users will have no permissions'
    );
  }

  // Step 5: Check RBAC matrix covers all endpoints with auth
  const authEndpoints = schemas.apiSchema.endpoints.filter(
    (ep) => ep.authRequired
  );
  const rbacResources = new Set(schemas.authSchema.rbacMatrix.map((r) => r.resource));
  const unprotectedAuthEndpoints = authEndpoints.filter(
    (ep) => !rbacResources.has(ep.path) && !rbacResources.has(normalizePath(ep.path))
  );
  if (unprotectedAuthEndpoints.length > 0) {
    issues.push(
      `${unprotectedAuthEndpoints.length} authenticated endpoint(s) have no RBAC coverage: ${unprotectedAuthEndpoints.map((e) => `${e.method} ${e.path}`).join(', ')}`
    );
  }

  // Step 6: Verify protected resources match actual resources
  const protectedApiEndpoints = schemas.authSchema.protectedResources.filter(
    (r) => r.type === 'api_endpoint'
  );
  const apiPaths = new Set(schemas.apiSchema.endpoints.map((e) => e.path));
  const staleProtectedEndpoints = protectedApiEndpoints.filter(
    (r) => !apiPaths.has(r.identifier) && !apiPaths.has(normalizePath(r.identifier))
  );
  if (staleProtectedEndpoints.length > 0) {
    issues.push(
      `${staleProtectedEndpoints.length} protected resource(s) reference non-existent API endpoints: ${staleProtectedEndpoints.map((r) => r.identifier).join(', ')}`
    );
  }

  // Step 7: Check permission definitions cover RBAC actions
  const permissionResources = new Set(schemas.authSchema.permissions.map((p) => p.resource));
  for (const rule of schemas.authSchema.rbacMatrix) {
    if (!permissionResources.has(rule.resource)) {
      issues.push(
        `RBAC rule for resource "${rule.resource}" has no matching permission definition`
      );
    }
  }

  const status: RuntimeCheck['status'] = issues.length > 0 ? 'warning' : 'pass';

  return {
    name: 'Auth Flow Simulation',
    category: 'auth_flow',
    status,
    details:
      issues.length > 0
        ? `${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `Auth flow simulated successfully: strategy=${strategy}, ${roles.length} roles, ${schemas.authSchema.rbacMatrix.length} RBAC rules, ${schemas.authSchema.permissions.length} permissions. Login → token → API access → permission check flow is valid.`,
    simulatedOutput:
      status === 'pass'
        ? `→ Login attempt → Token generated (${sessionConfig.tokenExpiry}) → ${authEndpoints.length} protected endpoints → RBAC check passed`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Check 4: Form Submission Flow
// ---------------------------------------------------------------------------

function checkFormSubmissionFlow(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];

  const apiEndpointMap = new Map<string, (typeof schemas.apiSchema.endpoints)[number]>();
  for (const ep of schemas.apiSchema.endpoints) {
    const key = `${ep.method} ${normalizePath(ep.path)}`;
    apiEndpointMap.set(key, ep);
  }

  const dbTableNames = new Set(schemas.dbSchema.tables.map((t) => t.name));

  for (const page of schemas.uiSchema.pages) {
    for (const form of page.forms) {
      const formPath = normalizePath(form.action);
      const method = form.method;

      // Step 1: Find matching API endpoint
      const endpoint = apiEndpointMap.get(`${method} ${formPath}`);
      if (!endpoint) {
        issues.push(
          `Form "${form.name}" (page: "${page.name}"): No ${method} endpoint at "${form.action}"`
        );
        continue;
      }

      // Step 2: Check auth alignment
      if (page.authRequired && !endpoint.authRequired) {
        issues.push(
          `Form "${form.name}" is on an auth-required page but its endpoint (${method} ${form.action}) does not require auth`
        );
      }
      if (!page.authRequired && endpoint.authRequired) {
        // This might be intentional (e.g., login form), just warn
      }

      // Step 3: Check field mapping
      if (endpoint.requestBody) {
        const apiFields = new Set(endpoint.requestBody.fields.map((f) => f.name));
        const formFields = new Set(form.fields.map((f) => f.apiField));

        // Form fields not in API
        for (const ff of formFields) {
          if (!apiFields.has(ff)) {
            issues.push(
              `Form "${form.name}": field "${ff}" not found in API endpoint request body`
            );
          }
        }

        // Required API fields not in form
        for (const af of endpoint.requestBody.fields) {
          if (af.required && !formFields.has(af.name)) {
            issues.push(
              `Form "${form.name}": required API field "${af.name}" is missing from form`
            );
          }
        }
      } else if (form.fields.length > 0) {
        issues.push(
          `Form "${form.name}" has ${form.fields.length} field(s) but endpoint has no request body`
        );
      }

      // Step 4: Check DB operation chain
      const dbTable = endpoint.dbOperation.table;
      if (!dbTableNames.has(dbTable)) {
        issues.push(
          `Form "${form.name}" → endpoint → DB table "${dbTable}" does not exist`
        );
      }

      // Step 5: Verify form method matches DB operation type
      const methodToOp: Record<string, string> = {
        POST: 'INSERT',
        PUT: 'UPDATE',
        PATCH: 'UPDATE',
      };
      const expectedOp = methodToOp[method];
      if (expectedOp && endpoint.dbOperation.type !== expectedOp) {
        issues.push(
          `Form "${form.name}" uses ${method} but endpoint performs ${endpoint.dbOperation.type} operation — expected ${expectedOp}`
        );
      }
    }
  }

  // Count forms with successful flow tracing
  const totalForms = schemas.uiSchema.pages.reduce(
    (sum, p) => sum + p.forms.length,
    0
  );
  const failedForms = new Set(issues.map((i) => i.match(/Form "([^"]+)"/)?.[1])).size;

  const status: RuntimeCheck['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    name: 'Form Submission Flow',
    category: 'form_submission',
    status,
    details:
      issues.length > 0
        ? `Found ${issues.length} issue(s) in ${failedForms}/${totalForms} form(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `All ${totalForms} form(s) trace successfully: form submit → API call → DB operation. Field mappings validated.`,
    simulatedOutput:
      status === 'pass'
        ? `✓ ${totalForms} forms → ${totalForms} API endpoints → ${totalForms} DB operations | ✓ Field maps valid`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Check 5: Page Rendering
// ---------------------------------------------------------------------------

function checkPageRendering(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];

  const layoutIds = new Set(schemas.uiSchema.layouts.map((l) => l.id));
  const navRoutes = new Set(
    schemas.uiSchema.navigation.items.map((i) => i.route)
  );
  const pageRoutes = new Set(schemas.uiSchema.pages.map((p) => p.route));

  // Check each page has a valid layout
  for (const page of schemas.uiSchema.pages) {
    // Layout is an enum, not a reference to layout ID, so validate enum value
    const validLayouts = [
      'full_width',
      'sidebar',
      'dashboard',
      'split',
      'modal',
    ];
    if (!validLayouts.includes(page.layout)) {
      issues.push(
        `Page "${page.name}" has invalid layout "${page.layout}"`
      );
    }

    // Check that the page route exists in navigation (for non-modal pages)
    if (page.layout !== 'modal' && !navRoutes.has(page.route)) {
      // Not every page needs to be in nav (e.g., detail pages) — just warn
      issues.push(
        `Page "${page.name}" (route: ${page.route}) is not in navigation items — users may not be able to find it`
      );
    }
  }

  // Check navigation items reference valid page routes
  for (const item of schemas.uiSchema.navigation.items) {
    if (!pageRoutes.has(item.route)) {
      issues.push(
        `Navigation item "${item.label}" references route "${item.route}" which has no corresponding page`
      );
    }

    // Check nav role references
    const roleNames = new Set(schemas.authSchema.roles.map((r) => r.name));
    for (const role of item.rolesAllowed) {
      if (!roleNames.has(role)) {
        issues.push(
          `Navigation item "${item.label}" allows role "${role}" which is not defined in auth`
        );
      }
    }
  }

  // Check protected routes reference valid page routes
  for (const route of schemas.uiSchema.protectedRoutes) {
    if (!pageRoutes.has(route.route)) {
      issues.push(
        `Protected route "${route.route}" references a page that does not exist`
      );
    }
  }

  // Check loading states are non-empty for pages with async data
  for (const page of schemas.uiSchema.pages) {
    const hasTables = page.tables.length > 0;
    const hasDashboards = page.dashboards.length > 0;
    if ((hasTables || hasDashboards) && page.loadingStates.length === 0) {
      issues.push(
        `Page "${page.name}" has async data sources (tables/dashboards) but no loading states defined`
      );
    }

    // Check error states for pages with forms
    if (page.forms.length > 0 && page.errorStates.length === 0) {
      issues.push(
        `Page "${page.name}" has forms but no error states defined`
      );
    }
  }

  // Check reusable components have valid types
  const validComponentTypes = [
    'navigation',
    'header',
    'sidebar',
    'breadcrumb',
    'pagination',
    'search',
    'filter',
    'modal',
    'toast',
    'dropdown',
    'tab',
  ];
  for (const comp of schemas.uiSchema.reusableComponents) {
    if (!validComponentTypes.includes(comp.type)) {
      issues.push(
        `Reusable component "${comp.name}" has invalid type "${comp.type}"`
      );
    }
  }

  // Check dashboard widgets have valid data sources
  const apiPaths = new Set(
    schemas.apiSchema.endpoints
      .filter((e) => e.method === 'GET')
      .map((e) => normalizePath(e.path))
  );
  for (const page of schemas.uiSchema.pages) {
    for (const dashboard of page.dashboards) {
      for (const widget of dashboard.widgets) {
        if (!apiPaths.has(normalizePath(widget.dataSource))) {
          issues.push(
            `Dashboard widget "${widget.title}" (page: "${page.name}") references data source "${widget.dataSource}" with no matching GET endpoint`
          );
        }
      }
    }
  }

  // Categorize: navigation issues are warnings, missing data sources are errors
  const hasErrors = issues.some(
    (i) =>
      i.includes('invalid layout') ||
      i.includes('references a page that does not exist') ||
      i.includes('references data source') ||
      i.includes('invalid type')
  );
  const status: RuntimeCheck['status'] = hasErrors
    ? 'fail'
    : issues.length > 0
      ? 'warning'
      : 'pass';

  return {
    name: 'Page Rendering',
    category: 'page_rendering',
    status,
    details:
      issues.length > 0
        ? `${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `All ${schemas.uiSchema.pages.length} pages validated. Layouts, navigation, loading states, error states, and data sources are correctly configured.`,
    simulatedOutput:
      status === 'pass'
        ? `✓ ${schemas.uiSchema.pages.length} pages | ✓ ${schemas.uiSchema.navigation.items.length} nav items | ✓ ${schemas.uiSchema.layouts.length} layouts`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Check 6: Schema Cross-Compilation
// ---------------------------------------------------------------------------

function checkSchemaCrossCompilation(schemas: SchemaBundle): RuntimeCheck {
  const issues: string[] = [];

  // Attempt to serialize each schema to JSON
  const schemaEntries: [string, unknown][] = [
    ['uiSchema', schemas.uiSchema],
    ['apiSchema', schemas.apiSchema],
    ['dbSchema', schemas.dbSchema],
    ['authSchema', schemas.authSchema],
    ['businessLogic', schemas.businessLogic],
  ];

  for (const [name, schema] of schemaEntries) {
    try {
      const serialized = JSON.stringify(schema);
      if (serialized === undefined || serialized === 'undefined') {
        issues.push(`${name}: Serialization returned undefined`);
      }
      if (serialized.length === 0) {
        issues.push(`${name}: Serialized to empty string`);
      }

      // Verify round-trip
      const parsed = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object') {
        issues.push(`${name}: Round-trip parse failed — did not return an object`);
      }
    } catch (error) {
      issues.push(
        `${name}: JSON serialization failed — ${(error as Error).message}`
      );
    }
  }

  // Check that all schemas have expected top-level fields
  const ui = schemas.uiSchema as Record<string, unknown>;
  const requiredUIArrayFields = ['pages', 'layouts', 'reusableComponents', 'protectedRoutes'];
  for (const field of requiredUIArrayFields) {
    if (!Array.isArray(ui[field])) {
      issues.push(`uiSchema: Missing or invalid "${field}" field`);
    }
  }
  if (!ui.navigation || typeof ui.navigation !== 'object' || Array.isArray(ui.navigation)) {
    issues.push('uiSchema: Missing or invalid "navigation" field');
  }

  const requiredAPIFields = ['version', 'basePath', 'endpoints', 'sharedTypes', 'errorResponses'];
  for (const field of requiredAPIFields) {
    if (!(field in schemas.apiSchema)) {
      issues.push(`apiSchema: Missing "${field}" field`);
    }
  }

  const requiredDBFields = ['dialect', 'tables', 'enums', 'sharedColumns'];
  for (const field of requiredDBFields) {
    if (!(field in schemas.dbSchema)) {
      issues.push(`dbSchema: Missing "${field}" field`);
    }
  }

  const requiredAuthFields = ['strategy', 'roles', 'permissions', 'rbacMatrix', 'protectedResources', 'sessionConfig', 'passwordPolicy'];
  for (const field of requiredAuthFields) {
    if (!(field in schemas.authSchema)) {
      issues.push(`authSchema: Missing "${field}" field`);
    }
  }

  const requiredBLFields = ['rules', 'workflows', 'featureFlags', 'billing', 'premiumGating', 'lifecycleHooks', 'analyticsPermissions'];
  for (const field of requiredBLFields) {
    if (!(field in schemas.businessLogic)) {
      issues.push(`businessLogic: Missing "${field}" field`);
    }
  }

  // Check for circular references in business logic workflows
  for (const wf of schemas.businessLogic.workflows) {
    const stepIds = new Set(wf.steps.map((s) => s.id));
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      if (inStack.has(stepId)) return true;
      if (visited.has(stepId)) return false;
      visited.add(stepId);
      inStack.add(stepId);

      const step = wf.steps.find((s) => s.id === stepId);
      if (step) {
        for (const transition of step.transitions) {
          if (stepIds.has(transition.target) && hasCycle(transition.target)) {
            return true;
          }
        }
      }

      inStack.delete(stepId);
      return false;
    };

    if (hasCycle(wf.initialStep)) {
      issues.push(
        `Workflow "${wf.name}" contains a circular transition path — this would cause an infinite loop at runtime`
      );
    }
  }

  // Check schema sizes (early warning for very large schemas)
  for (const [name, schema] of schemaEntries) {
    const size = JSON.stringify(schema).length;
    if (size > 100_000) {
      issues.push(
        `${name}: Schema is very large (${(size / 1024).toFixed(1)}KB) — consider splitting into modules`
      );
    }
  }

  const status: RuntimeCheck['status'] = issues.length > 0 ? 'fail' : 'pass';

  const totalSize = schemaEntries.reduce(
    (sum, [, schema]) => sum + JSON.stringify(schema).length,
    0
  );

  return {
    name: 'Schema Cross-Compilation',
    category: 'schema_compilation',
    status,
    details:
      issues.length > 0
        ? `Found ${issues.length} issue(s): ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
        : `All 5 schemas serialize to valid JSON and round-trip successfully. Total size: ${(totalSize / 1024).toFixed(1)}KB. No circular references detected.`,
    simulatedOutput:
      status === 'pass'
        ? `✓ 5/5 schemas serialize | ✓ Round-trip parse valid | ✓ ${(totalSize / 1024).toFixed(1)}KB total | ✓ No circular refs`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(path: string): string {
  return path.replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
}
