/**
 * Stage 3 — Schema Generation
 *
 * WHY: Architecture alone doesn't give us buildable schemas. This stage acts
 * as a compiler's code generation phase — it produces concrete, typed schemas
 * for every layer of the application (UI, API, DB, Auth, Business Logic) that
 * downstream code generators can directly consume.
 *
 * DESIGN DECISIONS:
 * - Single LLM call: Generating all 5 schemas in one call preserves cross-layer
 *   consistency. Separate calls would risk divergent field names, types, or
 *   references between layers. The tradeoff is a larger, more complex prompt
 *   and response — but the consistency guarantee is worth it.
 * - Strict cross-referencing: UI pages reference API endpoints, API endpoints
 *   reference DB tables, Auth RBAC maps to both pages and endpoints, and
 *   business rules reference entities. This creates a web of references that
 *   the validation stage (Stage 4) can verify.
 * - Explicit field mapping: Every UI form field has an `apiField` that maps to
 *   the API request body, and every API endpoint has a `dbOperation` that maps
 *   to a DB table. This eliminates the "field name mismatch" class of bugs.
 */

import { z } from 'zod';
import type {
  Intent,
  Architecture,
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
  StageResult,
} from './types';
import {
  UISchema as UISchemaZod,
  APISchema as APISchemaZod,
  DBSchema as DBSchemaZod,
  AuthSchema as AuthSchemaZod,
  BusinessLogicSchema as BusinessLogicSchemaZod,
} from './types';
import { structuredGenerate } from './llm';

// ============================================================
// Combined Output Type
// ============================================================

/**
 * The single response object that the LLM must produce.
 * Contains all 5 schemas with full cross-layer references.
 */
interface SchemaGenerationOutput {
  uiSchema: UISchema;
  apiSchema: APISchema;
  dbSchema: DBSchema;
  authSchema: AuthSchema;
  businessLogic: BusinessLogicSchema;
}

// Zod validation for the combined output
const SchemaGenerationOutputSchema = z.object({
  uiSchema: UISchemaZod,
  apiSchema: APISchemaZod,
  dbSchema: DBSchemaZod,
  authSchema: AuthSchemaZod,
  businessLogic: BusinessLogicSchemaZod,
});

// ============================================================
// Schema Description for LLM
// ============================================================

const SCHEMA_GENERATION_DESCRIPTION = `
You must return a SINGLE JSON object with exactly 5 top-level keys: "uiSchema", "apiSchema", "dbSchema", "authSchema", "businessLogic".

## uiSchema structure:
{
  "pages": [{
    "id": "string — Unique page ID (e.g., 'page-001')",
    "name": "string — Human-readable page name",
    "route": "string — Route path matching frontend modules from architecture",
    "layout": "'full_width' | 'sidebar' | 'dashboard' | 'split' | 'modal'",
    "authRequired": "boolean",
    "rolesAllowed": ["string — Role names that can access this page"],
    "forms": [{
      "id": "string — Form ID (e.g., 'form-001')",
      "name": "string — Form name",
      "action": "string — API endpoint this form submits to (e.g., '/api/v1/users')",
      "method": "'POST' | 'PUT' | 'PATCH'",
      "fields": [{
        "name": "string — Field name (camelCase)",
        "label": "string — Display label",
        "type": "'text' | 'email' | 'password' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'textarea' | 'file' | 'toggle' | 'autocomplete'",
        "required": "boolean",
        "placeholder": "string — optional placeholder text",
        "validation": { "min": "number?", "max": "number?", "pattern": "string?", "customRules": ["string?"] },
        "disabled": "boolean? — optional",
        "defaultValue": "any? — optional default value",
        "apiField": "string — MUST match the corresponding field name in the API body and DB column"
      }],
      "submitLabel": "string — Submit button text (e.g., 'Create', 'Save Changes')"
    }],
    "tables": [{
      "id": "string — Table ID (e.g., 'table-001')",
      "name": "string — Table display name",
      "dataSource": "string — API endpoint that provides data (e.g., 'GET /api/v1/users')",
      "columns": [{
        "key": "string — Column identifier (camelCase)",
        "label": "string — Column header text",
        "sortable": "boolean",
        "filterable": "boolean",
        "width": "string? — optional CSS width",
        "type": "'text' | 'number' | 'date' | 'boolean' | 'badge' | 'avatar' | 'link' | 'action'",
        "apiField": "string — MUST match the API response field name"
      }],
      "pagination": "boolean",
      "searchable": "boolean",
      "rowActions": ["string — e.g., 'edit', 'delete', 'view'"],
      "bulkActions": ["string — e.g., 'delete_selected', 'export'"]
    }],
    "dashboards": [{
      "id": "string — Dashboard ID",
      "name": "string — Dashboard name",
      "widgets": [{
        "id": "string — Widget ID",
        "type": "'metric_card' | 'chart' | 'table' | 'list' | 'progress' | 'calendar'",
        "title": "string — Widget title",
        "dataSource": "string — API endpoint for widget data",
        "size": "'sm' | 'md' | 'lg' | 'full'",
        "refreshInterval": "string? — e.g., '30s', '5m'",
        "requiredPermission": "string? — Permission required to see this widget"
      }]
    }],
    "loadingStates": ["string — Loading indicators needed on this page"],
    "errorStates": [{ "scenario": "string", "message": "string", "action": "string" }]
  }],
  "layouts": [{ "id": "string", "name": "string", "sections": ["string — section identifiers"] }],
  "navigation": {
    "items": [{ "label": "string", "route": "string", "icon": "string?", "rolesAllowed": ["string"], "children": [] }],
    "breadcrumbRoot": "string — Root breadcrumb label"
  },
  "reusableComponents": [{ "id": "string", "name": "string", "type": "'navigation' | 'header' | 'sidebar' | 'breadcrumb' | 'pagination' | 'search' | 'filter' | 'modal' | 'toast' | 'dropdown' | 'tab'", "props": {}, "reusable": "boolean" }],
  "protectedRoutes": [{ "route": "string", "roles": ["string"], "redirect": "string" }]
}

## apiSchema structure:
{
  "version": "string — e.g., 'v1'",
  "basePath": "string — e.g., '/api'",
  "endpoints": [{
    "id": "string — Endpoint ID (e.g., 'api-001')",
    "method": "'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'",
    "path": "string — Full path (e.g., '/api/v1/users')",
    "summary": "string — Short description",
    "description": "string — Detailed description",
    "params": [{ "name": "string", "type": "'string' | 'number' | 'boolean' | 'integer' | 'uuid' | 'email' | 'date'", "in": "'path' | 'query' | 'header' | 'cookie'", "required": "boolean", "description": "string", "validation": "string?" }],
    "requestBody": {
      "contentType": "'application/json' | 'multipart/form-data'",
      "fields": [{ "name": "string", "type": "string", "required": "boolean", "description": "string", "validation": "string?" }]
    },
    "responses": [{ "statusCode": "number", "description": "string", "schema": {} }],
    "authRequired": "boolean",
    "requiredRoles": ["string"],
    "rateLimit": { "maxRequests": "number", "windowMs": "number" },
    "pagination": { "supported": "boolean", "defaultLimit": "number", "maxLimit": "number", "cursorBased": "boolean" },
    "dbOperation": { "table": "string — MUST match a DB table name", "type": "'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'JOIN'", "fields": ["string — column names operated on"] }
  }],
  "sharedTypes": [{ "name": "string", "definition": {} }],
  "errorResponses": [{ "code": "number", "name": "string", "description": "string", "fields": ["string"] }]
}

## dbSchema structure:
{
  "dialect": "'postgresql' | 'mysql' | 'sqlite'",
  "tables": [{
    "name": "string — Table name (snake_case, e.g., 'users', 'order_items')",
    "description": "string — What this table stores",
    "columns": [{
      "name": "string — Column name (snake_case)",
      "type": "'String' | 'Int' | 'BigInt' | 'Float' | 'Decimal' | 'Boolean' | 'DateTime' | 'Json' | 'Bytes' | 'Enum'",
      "required": "boolean",
      "unique": "boolean?",
      "default": "any? — default value",
      "indexed": "boolean?",
      "description": "string",
      "references": { "table": "string", "column": "string", "onDelete": "'CASCADE' | 'SET_NULL' | 'RESTRICT' | 'NO_ACTION'" },
      "enumValues": ["string?"]
    }],
    "indexes": [{ "name": "string", "columns": ["string"], "unique": "boolean", "type": "'btree' | 'hash' | 'gin'?" }],
    "constraints": [{ "name": "string", "type": "'PRIMARY_KEY' | 'UNIQUE' | 'CHECK' | 'FOREIGN_KEY'", "definition": "string" }],
    "auditFields": "boolean — Whether to include createdAt/updatedAt",
    "softDelete": "boolean — Whether to include deletedAt for soft deletion"
  }],
  "enums": [{ "name": "string — PascalCase enum name", "values": ["string"] }],
  "sharedColumns": [{ "name": "string", "definition": "string", "usedIn": ["string — table names"] }]
}

## authSchema structure:
{
  "strategy": "'jwt' | 'session' | 'oauth' | 'magic_link' | 'api_key'",
  "roles": [{ "name": "string", "description": "string", "level": "number — higher = more permissions", "isDefault": "boolean" }],
  "permissions": [{ "id": "string", "name": "string", "description": "string", "resource": "string", "actions": ["'create' | 'read' | 'update' | 'delete' | 'manage' | 'execute'"] }],
  "rbacMatrix": [{ "role": "string", "resource": "string", "actions": ["string"], "conditions": ["string?"] }],
  "protectedResources": [{ "type": "'page' | 'api_endpoint' | 'component' | 'data_field' | 'dashboard_widget'", "identifier": "string — route or endpoint path", "rolesAllowed": ["string"], "permissionRequired": "string?" }],
  "sessionConfig": { "tokenExpiry": "string", "refreshExpiry": "string", "storage": "'cookie' | 'localStorage' | 'httpOnly'", "secure": "boolean", "sameSite": "'strict' | 'lax' | 'none'" },
  "passwordPolicy": { "minLength": "number", "requireUppercase": "boolean", "requireLowercase": "boolean", "requireNumbers": "boolean", "requireSpecialChars": "boolean" }
}

## businessLogic structure:
{
  "rules": [{
    "id": "string — e.g., 'rule-001'",
    "name": "string — Rule name",
    "description": "string — What this rule enforces",
    "trigger": "'on_create' | 'on_update' | 'on_delete' | 'on_read' | 'on_schedule' | 'on_event'",
    "condition": "string — When this rule activates",
    "action": "string — What the rule does",
    "priority": "number — Higher = evaluated first",
    "entity": "string? — Entity this rule applies to"
  }],
  "workflows": [{
    "id": "string — e.g., 'workflow-001'",
    "name": "string",
    "description": "string",
    "entity": "string — MUST match a DB table / entity name",
    "initialStep": "string — ID of the first step",
    "steps": [{
      "id": "string — Step ID",
      "name": "string",
      "description": "string",
      "assignee": "string — Role or system that performs this step",
      "conditions": ["string — Conditions to proceed"],
      "transitions": [{ "target": "string — Step ID to transition to", "condition": "string", "action": "string" }],
      "timeout": "string? — e.g., '24h', '7d'",
      "onTimeout": "string? — What happens on timeout"
    }]
  }],
  "featureFlags": [{ "id": "string", "name": "string", "description": "string", "enabledByDefault": "boolean", "rolloutPercentage": "number 0-100", "targetRoles": ["string?"], "targetPlans": ["string?"] }],
  "billing": {
    "enabled": "boolean",
    "config": {
      "provider": "string",
      "model": "'subscription' | 'usage_based' | 'freemium' | 'one_time'",
      "plans": [{ "name": "string", "price": "number", "interval": "'monthly' | 'yearly' | 'one_time'", "features": ["string"], "limits": {}, "stripePriceId": "string?" }],
      "trialConfig": { "enabled": "boolean", "durationDays": "number", "features": ["string"] },
      "webhookEvents": ["string"]
    }
  },
  "premiumGating": [{ "feature": "string", "requiredPlan": "string", "fallbackBehavior": "string" }],
  "lifecycleHooks": [{ "event": "string", "handler": "string", "description": "string" }],
  "analyticsPermissions": [{ "dashboard": "string", "rolesAllowed": ["string"], "dataAccess": "string" }]
}`;

// ============================================================
// Prompt Builder
// ============================================================

function buildSchemaGenerationPrompt(intent: Intent, architecture: Architecture): string {
  // Serialize intent
  const intentSummary = `
### Product: ${intent.productName} (${intent.productType})
Complexity: ${intent.complexity}

### Features:
${intent.features.map((f) => `- [${f.id}] ${f.name} (${f.priority}, ${f.category}): ${f.description}`).join('\n')}

### Actors:
${intent.actors.map((a) => `- [${a.id}] ${a.name} (${a.role}): ${a.description} | Permissions: [${a.permissions.join(', ')}]`).join('\n')}

### Entities:
${intent.entities.map((e) => {
  const attrs = e.attributes.map((a) => `  ${a.name}: ${a.type}${a.required ? ' (required)' : ''}`).join('\n');
  const rels = e.relationships.map((r) => `  → ${r.target} (${r.type}: ${r.description})`).join('\n');
  return `- [${e.id}] ${e.name}: ${e.description}\n${attrs}${rels ? '\n' + rels : ''}`;
}).join('\n')}

### Constraints:
${intent.constraints.map((c) => `- [${c.id}] ${c.type} (${c.severity}): ${c.description}`).join('\n')}

### Integrations:
${intent.integrations.map((i) => `- ${i.name} (${i.type}, ${i.required ? 'REQUIRED' : 'optional'}): ${i.purpose}`).join('\n')}

### Assumptions:
${intent.assumptions.map((a) => `- [${a.id}] (${a.confidence}): ${a.description}`).join('\n')}
`;

  // Serialize architecture
  const archSummary = `
### Architectural Reasoning:
${architecture.architecturalReasoning}

### Domain Model:
${architecture.domainModel.map((d) => `- ${d.entity}: services=[${d.services.join(', ')}], workflows=[${d.workflows.join(', ')}]`).join('\n')}

### Service Boundaries:
${architecture.serviceBoundaries.map((s) => `- ${s.name}: owns=[${s.ownsEntities.join(', ')}], exposes=[${s.exposesEndpoints.join(', ')}], depends=[${s.dependsOn.join(', ')}]`).join('\n')}

### Frontend Structure:
${architecture.frontendStructure.map((f) => `- ${f.name} (${f.route}): auth=${f.authRequired}, roles=[${f.rolesAllowed.join(', ')}], components=[${f.components.join(', ')}]`).join('\n')}

### Backend Modules:
${architecture.backendModules.map((b) => {
  const eps = b.endpoints.map((e) => `  ${e.method} ${e.path} (auth=${e.authRequired}): ${e.description}`).join('\n');
  return `- ${b.name}: ${b.responsibility}\n  dataAccess: [${b.dataAccess.join(', ')}]\n  events: [${b.events.join(', ')}]\n${eps}`;
}).join('\n')}

### Auth Flow:
Strategy: ${architecture.authFlow.strategy}
Provider: ${architecture.authFlow.provider}
Token Storage: ${architecture.authFlow.tokenStorage}
MFA: ${architecture.authFlow.mfa}

### API Map:
${architecture.apiMap.map((a) => `- ${a.endpoint} → ${a.service} (${a.version}${a.deprecated ? ', DEPRECATED' : ''})`).join('\n')}

### State Management:
Global: ${architecture.stateManagement.globalState.map((s) => `${s.name} (${s.source}/${s.persistence})`).join(', ') || 'none'}
Server: ${architecture.stateManagement.serverState.map((s) => `${s.name} (stale=${s.staleTime}, ${s.cacheStrategy})`).join(', ') || 'none'}

### Dependency Graph:
${architecture.dependencyGraph.map((d) => `- ${d.from} → ${d.to} (${d.type})`).join('\n')}

### Feature Ownership:
${architecture.featureOwnership.map((f) => `- ${f.feature}: frontend=${f.frontendModule}, backend=${f.backendModule}, service=${f.service}`).join('\n')}
`;

  return `You are a meticulous system engineer generating production-ready schemas for a ${intent.complexity} ${intent.productType} application.

You must generate ALL FIVE schemas (uiSchema, apiSchema, dbSchema, authSchema, businessLogic) as a single JSON object. Cross-layer consistency is your TOP PRIORITY.

## PRODUCT INTENT:
${intentSummary}

## ARCHITECTURE:
${archSummary}

---

## GENERATION REQUIREMENTS:

### UI SCHEMA (uiSchema)
1. Create pages for EVERY route defined in the frontend structure.
2. Every page must have appropriate forms, tables, and/or dashboards.
3. Form fields MUST have a 'apiField' property that exactly matches the field name in the API request body.
4. Table columns MUST have a 'apiField' property that matches the API response field names.
5. Dashboard widgets MUST reference real API endpoints in their 'dataSource' property.
6. Navigation items MUST match page routes and respect role permissions.
7. Every page that requires auth MUST have authRequired: true and correct rolesAllowed.
8. Include error states and loading states for every page with async operations.
9. Include reusable components for navigation, search, modals, toasts, etc.

### API SCHEMA (apiSchema)
1. Create endpoints for EVERY backend module endpoint from the architecture.
2. Every endpoint MUST have dbOperation.table referencing a real DB table name.
3. Request body field names MUST match DB column names (use camelCase for API, snake_case for DB — map them in apiField/dbOperation).
4. Every endpoint with auth MUST have authRequired: true and requiredRoles.
5. Include rate limiting on all mutation endpoints.
6. Include pagination config on all list endpoints.
7. Define shared types for common response shapes (PaginationMeta, ErrorResponse, etc.).
8. Define standard error responses (400, 401, 403, 404, 409, 422, 500).

### DB SCHEMA (dbSchema)
1. Create a table for EVERY entity from the intent.
2. Column names MUST be snake_case.
3. Column types MUST match the entity attribute types (string→String, number→Int/Float, boolean→Boolean, etc.).
4. Foreign key references MUST use exact table and column names.
5. Every table MUST have audit fields (createdAt, updatedAt) enabled.
6. Add appropriate indexes for foreign keys, frequently queried fields, and unique constraints.
7. Define enums for any entity attributes that use the 'enum' type.
8. Add soft delete (deletedAt) to important entities.
9. Always include an 'id' column as PRIMARY KEY.

### AUTH SCHEMA (authSchema)
1. Match the auth strategy from the architecture's authFlow.
2. Define roles that match ALL actors from the intent.
3. Permissions MUST cover ALL CRUD operations on ALL entities.
4. RBAC matrix MUST map roles → resources → actions.
5. Protected resources MUST include:
   - Every page from uiSchema that requires auth (type: "page")
   - Every API endpoint that requires auth (type: "api_endpoint")
   - Dashboard widgets with role restrictions (type: "dashboard_widget")
6. Session config MUST match the architecture's authFlow settings.

### BUSINESS LOGIC (businessLogic)
1. Rules MUST reference entities from the intent by name.
2. Workflows MUST use entity names that match DB tables.
3. Workflow steps MUST have valid transitions (all targets must reference step IDs).
4. Feature flags for features that might not be available to all users.
5. Billing config: only if the intent mentions billing/payments.
6. Premium gating: only if there are billing plans.
7. Lifecycle hooks for events like user registration, order creation, etc.

---

## CROSS-LAYER CONSISTENCY RULES (CRITICAL):

1. **Field Name Consistency**: If the DB has a column 'email_address', the API uses 'emailAddress' in request/response, and the UI form field has apiField: 'emailAddress'.
2. **Table ↔ Endpoint Mapping**: Every API endpoint's dbOperation.table MUST exist in dbSchema.tables.
3. **Page ↔ Endpoint Mapping**: Every UI form's action MUST match an API endpoint path. Every UI table's dataSource MUST match an API endpoint path.
4. **Auth ↔ Page Mapping**: Every protected route in uiSchema MUST have a corresponding entry in authSchema.protectedResources (type: "page").
5. **Auth ↔ Endpoint Mapping**: Every API endpoint with authRequired=true MUST have a corresponding entry in authSchema.protectedResources (type: "api_endpoint").
6. **Entity ↔ Table Mapping**: Every entity from the intent MUST have a corresponding table in dbSchema.
7. **Business Rule ↔ Entity**: Every business rule MUST reference an entity that exists in dbSchema.

## CRITICAL RULES:
- Return ONLY valid JSON with these exact 5 keys: uiSchema, apiSchema, dbSchema, authSchema, businessLogic.
- Do NOT use markdown code fences.
- Do NOT add any prose or explanation outside the JSON.
- Ensure ALL arrays have at least one entry (empty arrays only if truly not applicable).
- Use consistent naming: camelCase for API/UI, snake_case for DB tables/columns, PascalCase for enum values.
- Pagination on list endpoints: always include page/pageSize or cursor params.
- Every form must have a submit button label.
- Every table must define at least 2 columns.`;
}

// ============================================================
// Stage Execution
// ============================================================

/**
 * Stage 3: Generate all application schemas from Architecture and Intent.
 *
 * This is the most complex pipeline stage. It produces 5 interlinked schemas
 * in a single LLM call to guarantee cross-layer consistency:
 * - UISchema: Pages, forms, tables, dashboards, navigation
 * - APISchema: Endpoints, request/response contracts, auth, rate limiting
 * - DBSchema: Tables, columns, indexes, constraints, enums
 * - AuthSchema: RBAC, roles, permissions, session config
 * - BusinessLogicSchema: Rules, workflows, feature flags, billing
 */
export async function generateSchemas(
  architecture: Architecture,
  intent: Intent
): Promise<{
  uiSchema: UISchema;
  apiSchema: APISchema;
  dbSchema: DBSchema;
  authSchema: AuthSchema;
  businessLogic: BusinessLogicSchema;
  stageResult: StageResult;
}> {
  const startTime = Date.now();

  const stageResult: StageResult = {
    stage: 3,
    name: 'Schema Generation',
    status: 'running',
    output: undefined,
    errors: [],
    warnings: [],
    latencyMs: 0,
    tokenUsage: 0,
    retries: 0,
  };

  try {
    // Guard: ensure inputs have minimum required data
    if (intent.entities.length === 0) {
      throw new Error(
        'Cannot generate schemas: intent has no entities. Ensure Stage 1 completed successfully.'
      );
    }
    if (architecture.backendModules.length === 0) {
      throw new Error(
        'Cannot generate schemas: architecture has no backend modules. Ensure Stage 2 completed successfully.'
      );
    }

    const schemaPrompt = buildSchemaGenerationPrompt(intent, architecture);

    // Use increased maxTokens since this is a very large schema generation
    const response = await structuredGenerate<SchemaGenerationOutput>(
      schemaPrompt,
      SCHEMA_GENERATION_DESCRIPTION,
      {
        temperature: 0,
        maxTokens: 16384,
        maxRetries: 3,
      }
    );

    // Validate the combined output
    const validationResult = SchemaGenerationOutputSchema.safeParse(response.content);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `${path}: ${issue.message}`;
      });

      stageResult.status = 'failed';
      stageResult.errors = errorMessages;
      stageResult.latencyMs = Date.now() - startTime;
      stageResult.tokenUsage = response.usage.totalTokens;
      stageResult.retries = response.retries;

      throw new Error(
        `Schema generation validation failed (${errorMessages.length} issues): ${errorMessages.slice(0, 10).join('; ')}${errorMessages.length > 10 ? ` ...and ${errorMessages.length - 10} more` : ''}`
      );
    }

    const { uiSchema, apiSchema, dbSchema, authSchema, businessLogic } = validationResult.data;

    // =============================================
    // Cross-Layer Consistency Validation
    // =============================================
    const warnings: string[] = [];

    // Collect all DB table names
    const dbTableNames = new Set(dbSchema.tables.map((t) => t.name));

    // 1. Check API endpoints reference valid DB tables
    for (const endpoint of apiSchema.endpoints) {
      if (!dbTableNames.has(endpoint.dbOperation.table)) {
        warnings.push(
          `API endpoint ${endpoint.method} ${endpoint.path} references DB table "${endpoint.dbOperation.table}" which does not exist.`
        );
      }
    }

    // 2. Check UI forms reference valid API endpoints
    const apiEndpointPaths = new Set(
      apiSchema.endpoints.map((e) => `${e.method} ${e.path}`)
    );
    for (const page of uiSchema.pages) {
      for (const form of page.forms) {
        const formAction = `${form.method} ${form.action}`;
        if (!apiEndpointPaths.has(formAction)) {
          warnings.push(
            `UI form "${form.name}" on page "${page.name}" submits to ${formAction} which has no matching API endpoint.`
          );
        }
      }
    }

    // 3. Check UI tables reference valid API endpoints
    for (const page of uiSchema.pages) {
      for (const table of page.tables) {
        if (!apiEndpointPaths.has(`GET ${table.dataSource}`)) {
          warnings.push(
            `UI table "${table.name}" on page "${page.name}" fetches from GET ${table.dataSource} which has no matching API endpoint.`
          );
        }
      }
    }

    // 4. Check entity ↔ table mapping
    const entityNames = new Set(intent.entities.map((e) => e.name.toLowerCase()));
    for (const table of dbSchema.tables) {
      // Allow slight naming differences (e.g., "User" → "users", "OrderItem" → "order_items")
      const normalizedTableName = table.name
        .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/^([a-z])/, (_, c) => c.toUpperCase());
      const singularized = normalizedTableName.endsWith('s')
        ? normalizedTableName.slice(0, -1)
        : normalizedTableName;
      if (
        !entityNames.has(table.name.toLowerCase()) &&
        !entityNames.has(normalizedTableName.toLowerCase()) &&
        !entityNames.has(singularized.toLowerCase()) &&
        table.name !== 'sessions' &&
        table.name !== 'accounts' &&
        table.name !== 'verification_tokens' &&
        table.name !== 'feature_flags' &&
        table.name !== 'audit_logs'
      ) {
        // Don't warn for common system tables
        if (!['subscription', 'billing', 'payment', 'invoice', 'notification', 'activity'].some(
          (prefix) => table.name.startsWith(prefix)
        )) {
          warnings.push(
            `DB table "${table.name}" does not directly map to any entity from the intent.`
          );
        }
      }
    }

    // 5. Check auth protected resources reference valid pages/endpoints
    const pageRoutes = new Set(uiSchema.pages.map((p) => p.route));
    for (const resource of authSchema.protectedResources) {
      if (resource.type === 'page' && !pageRoutes.has(resource.identifier)) {
        warnings.push(
          `Auth protected resource (page) references route "${resource.identifier}" which is not defined in UI schema.`
        );
      }
    }

    // 6. Check business logic rules reference valid entities
    const allTableNames = new Set(dbSchema.tables.map((t) => t.name));
    for (const rule of businessLogic.rules) {
      if (rule.entity && !allTableNames.has(rule.entity)) {
        warnings.push(
          `Business rule "${rule.name}" references entity "${rule.entity}" which is not a DB table.`
        );
      }
    }

    // 7. Check workflow entities
    for (const workflow of businessLogic.workflows) {
      if (!allTableNames.has(workflow.entity)) {
        warnings.push(
          `Workflow "${workflow.name}" references entity "${workflow.entity}" which is not a DB table.`
        );
      }
      // Check step transitions reference valid step IDs
      const stepIds = new Set(workflow.steps.map((s) => s.id));
      for (const step of workflow.steps) {
        for (const transition of step.transitions) {
          if (!stepIds.has(transition.target)) {
            warnings.push(
              `Workflow "${workflow.name}" step "${step.name}" transitions to "${transition.target}" which is not a valid step ID.`
            );
          }
        }
      }
    }

    stageResult.status = 'success';
    stageResult.output = {
      uiSchema,
      apiSchema,
      dbSchema,
      authSchema,
      businessLogic,
    };
    stageResult.warnings = warnings;
    stageResult.latencyMs = Date.now() - startTime;
    stageResult.tokenUsage = response.usage.totalTokens;
    stageResult.retries = response.retries;

    return {
      uiSchema,
      apiSchema,
      dbSchema,
      authSchema,
      businessLogic,
      stageResult,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during schema generation';

    if (stageResult.status === 'running') {
      stageResult.status = 'failed';
    }
    stageResult.errors.push(errorMessage);
    stageResult.latencyMs = Date.now() - startTime;

    console.error(`[Stage 3] Schema generation failed: ${errorMessage}`);

    // Return empty fallback schemas to allow pipeline error reporting
    return {
      uiSchema: {
        pages: [],
        layouts: [],
        navigation: { items: [], breadcrumbRoot: '' },
        reusableComponents: [],
        protectedRoutes: [],
      },
      apiSchema: {
        version: 'v1',
        basePath: '/api',
        endpoints: [],
        sharedTypes: [],
        errorResponses: [],
      },
      dbSchema: {
        dialect: 'postgresql',
        tables: [],
        enums: [],
        sharedColumns: [],
      },
      authSchema: {
        strategy: 'jwt',
        roles: [],
        permissions: [],
        rbacMatrix: [],
        protectedResources: [],
        sessionConfig: {
          tokenExpiry: '24h',
          refreshExpiry: '7d',
          storage: 'httpOnly',
          secure: true,
          sameSite: 'lax',
        },
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
        },
      },
      businessLogic: {
        rules: [],
        workflows: [],
        featureFlags: [],
        billing: { enabled: false, config: undefined },
        premiumGating: [],
        lifecycleHooks: [],
        analyticsPermissions: [],
      },
      stageResult,
    };
  }
}
