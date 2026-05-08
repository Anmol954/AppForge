/**
 * Pipeline Types & Zod Schemas
 *
 * WHY: Defines the intermediate representation (IR) for each pipeline stage.
 * Like a compiler's AST, these types enable type-safe transforms between stages.
 * Every stage consumes and produces typed data — preventing malformed outputs.
 *
 * TRADEOFFS:
 * - Deep Zod schemas add validation overhead (~1-2ms per parse)
 * - Strict typing reduces flexibility but catches bugs at stage boundaries
 * - Union types for optional features increase schema complexity but model real-world variance
 */

import { z } from 'zod';

// ============================================================
// Stage 1: Intent Extraction Schemas
// ============================================================

export const FeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum([
    'authentication',
    'authorization',
    'data_management',
    'reporting',
    'billing',
    'messaging',
    'search',
    'file_management',
    'workflow',
    'integration',
    'ui',
    'other',
  ]),
  dependencies: z.array(z.string()).describe('IDs of other features this depends on'),
});

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  role: z.enum(['admin', 'manager', 'user', 'guest', 'system', 'custom']),
  permissions: z.array(z.string()),
});

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  attributes: z.array(
    z.object({
      name: z.string(),
      type: z.enum([
        'string',
        'number',
        'boolean',
        'date',
        'datetime',
        'email',
        'phone',
        'url',
        'enum',
        'json',
        'text',
        'currency',
        'file',
      ]),
      required: z.boolean(),
      description: z.string(),
    })
  ),
  relationships: z.array(
    z.object({
      target: z.string(),
      type: z.enum(['one_to_one', 'one_to_many', 'many_to_many']),
      description: z.string(),
    })
  ),
});

export const ConstraintSchema = z.object({
  id: z.string(),
  type: z.enum(['business_rule', 'technical', 'security', 'compliance', 'performance']),
  description: z.string(),
  severity: z.enum(['blocking', 'warning', 'info']),
});

export const IntegrationSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  type: z.enum(['payment', 'email', 'storage', 'analytics', 'auth', 'messaging', 'ai', 'other']),
  required: z.boolean(),
});

export const AssumptionSchema = z.object({
  id: z.string(),
  description: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
});

export const IntentSchema = z.object({
  productType: z.string().describe('Normalized product category (e.g., CRM, LMS, E-commerce)'),
  productName: z.string().describe('Suggested product name'),
  features: z.array(FeatureSchema),
  actors: z.array(ActorSchema),
  entities: z.array(EntitySchema),
  constraints: z.array(ConstraintSchema),
  integrations: z.array(IntegrationSchema),
  assumptions: z.array(AssumptionSchema),
  summary: z.string().describe('High-level summary of the product'),
  complexity: z.enum(['simple', 'moderate', 'complex', 'enterprise']),
});

export type Intent = z.infer<typeof IntentSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Entity = z.infer<typeof EntitySchema>;

// ============================================================
// Stage 2: Architecture Design Schemas
// ============================================================

export const ServiceBoundarySchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  ownsEntities: z.array(z.string()),
  exposesEndpoints: z.array(z.string()),
  dependsOn: z.array(z.string()),
});

export const FrontendModuleSchema = z.object({
  name: z.string(),
  route: z.string(),
  components: z.array(z.string()),
  stateRequirements: z.array(z.string()),
  authRequired: z.boolean(),
  rolesAllowed: z.array(z.string()),
});

export const BackendModuleSchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  endpoints: z.array(
    z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string(),
      description: z.string(),
      authRequired: z.boolean(),
    })
  ),
  dataAccess: z.array(z.string()),
  events: z.array(z.string()),
});

export const StateManagementSchema = z.object({
  globalState: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      source: z.enum(['server', 'client', 'hybrid']),
      persistence: z.enum(['memory', 'localStorage', 'sessionStorage', 'database']),
    })
  ),
  serverState: z.array(
    z.object({
      name: z.string(),
      staleTime: z.string(),
      cacheStrategy: z.enum(['stale_while_revalidate', 'cache_first', 'network_only']),
    })
  ),
});

export const ArchitectureSchema = z.object({
  architecturalReasoning: z.string().describe('Why this architecture was chosen'),
  domainModel: z.array(
    z.object({
      entity: z.string(),
      services: z.array(z.string()),
      workflows: z.array(z.string()),
    })
  ),
  serviceBoundaries: z.array(ServiceBoundarySchema),
  frontendStructure: z.array(FrontendModuleSchema),
  backendModules: z.array(BackendModuleSchema),
  authFlow: z.object({
    strategy: z.enum(['jwt', 'session', 'oauth', 'magic_link']),
    provider: z.string(),
    tokenStorage: z.enum(['cookie', 'localStorage', 'httpOnly']),
    refreshMechanism: z.string(),
    mfa: z.boolean(),
  }),
  apiMap: z.array(
    z.object({
      endpoint: z.string(),
      service: z.string(),
      version: z.string(),
      deprecated: z.boolean(),
    })
  ),
  stateManagement: StateManagementSchema,
  dependencyGraph: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(['sync', 'async', 'event']),
    })
  ),
  featureOwnership: z.array(
    z.object({
      feature: z.string(),
      frontendModule: z.string(),
      backendModule: z.string(),
      service: z.string(),
    })
  ),
});

export type Architecture = z.infer<typeof ArchitectureSchema>;

// ============================================================
// Stage 3: Generated Schemas
// ============================================================

// UI Schema
export const UIFormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'email', 'password', 'number', 'date', 'select', 'multiselect', 'checkbox', 'radio', 'textarea', 'file', 'toggle', 'autocomplete']),
  required: z.boolean(),
  placeholder: z.string().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    customRules: z.array(z.string()).optional(),
  }).optional(),
  disabled: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  apiField: z.string().describe('Maps to API/DB field name'),
});

export const UITableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  sortable: z.boolean(),
  filterable: z.boolean(),
  width: z.string().optional(),
  type: z.enum(['text', 'number', 'date', 'boolean', 'badge', 'avatar', 'link', 'action']),
  apiField: z.string(),
});

export const UIDashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum(['metric_card', 'chart', 'table', 'list', 'progress', 'calendar']),
  title: z.string(),
  dataSource: z.string(),
  size: z.enum(['sm', 'md', 'lg', 'full']),
  refreshInterval: z.string().optional(),
  requiredPermission: z.string().optional(),
});

export const UIPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string(),
  layout: z.enum(['full_width', 'sidebar', 'dashboard', 'split', 'modal']),
  authRequired: z.boolean(),
  rolesAllowed: z.array(z.string()),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      action: z.string(),
      method: z.enum(['POST', 'PUT', 'PATCH']),
      fields: z.array(UIFormFieldSchema),
      submitLabel: z.string(),
    })
  ),
  tables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      dataSource: z.string(),
      columns: z.array(UITableColumnSchema),
      pagination: z.boolean(),
      searchable: z.boolean(),
      rowActions: z.array(z.string()),
      bulkActions: z.array(z.string()),
    })
  ),
  dashboards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      widgets: z.array(UIDashboardWidgetSchema),
    })
  ),
  loadingStates: z.array(z.string()).describe('Loading indicators needed'),
  errorStates: z.array(
    z.object({
      scenario: z.string(),
      message: z.string(),
      action: z.string(),
    })
  ),
});

export const UIComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['navigation', 'header', 'sidebar', 'breadcrumb', 'pagination', 'search', 'filter', 'modal', 'toast', 'dropdown', 'tab']),
  props: z.record(z.unknown()),
  reusable: z.boolean(),
});

export const UISchema = z.object({
  pages: z.array(UIPageSchema),
  layouts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sections: z.array(z.string()),
    })
  ),
  navigation: z.object({
    items: z.array(
      z.object({
        label: z.string(),
        route: z.string(),
        icon: z.string().optional(),
        rolesAllowed: z.array(z.string()),
        children: z.array(z.unknown()).optional(),
      })
    ),
    breadcrumbRoot: z.string(),
  }),
  reusableComponents: z.array(UIComponentSchema),
  protectedRoutes: z.array(
    z.object({
      route: z.string(),
      roles: z.array(z.string()),
      redirect: z.string(),
    })
  ),
});

export type UISchema = z.infer<typeof UISchema>;
export type UIPage = z.infer<typeof UIPageSchema>;

// API Schema
export const APIParamSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'integer', 'uuid', 'email', 'date']),
  in: z.enum(['path', 'query', 'header', 'cookie']),
  required: z.boolean(),
  description: z.string(),
  validation: z.string().optional(),
});

export const APIBodySchema = z.object({
  contentType: z.enum(['application/json', 'multipart/form-data']),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string(),
      validation: z.string().optional(),
    })
  ),
});

export const APIResponseSchema = z.object({
  statusCode: z.number(),
  description: z.string(),
  schema: z.record(z.unknown()).describe('Response body structure'),
});

export const APIEndpointSchema = z.object({
  id: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  summary: z.string(),
  description: z.string(),
  params: z.array(APIParamSchema),
  requestBody: APIBodySchema.optional(),
  responses: z.array(APIResponseSchema),
  authRequired: z.boolean(),
  requiredRoles: z.array(z.string()),
  rateLimit: z.object({
    maxRequests: z.number(),
    windowMs: z.number(),
  }),
  pagination: z.object({
    supported: z.boolean(),
    defaultLimit: z.number(),
    maxLimit: z.number(),
    cursorBased: z.boolean(),
  }).optional(),
  dbOperation: z.object({
    table: z.string(),
    type: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN']),
    fields: z.array(z.string()),
  }),
});

export const APISchema = z.object({
  version: z.string(),
  basePath: z.string(),
  endpoints: z.array(APIEndpointSchema),
  sharedTypes: z.array(
    z.object({
      name: z.string(),
      definition: z.record(z.unknown()),
    })
  ),
  errorResponses: z.array(
    z.object({
      code: z.number(),
      name: z.string(),
      description: z.string(),
      fields: z.array(z.string()),
    })
  ),
});

export type APISchema = z.infer<typeof APISchema>;
export type APIEndpoint = z.infer<typeof APIEndpointSchema>;

// Database Schema
export const DBColumnSchema = z.object({
  name: z.string(),
  type: z.enum([
    'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean',
    'DateTime', 'Json', 'Bytes', 'Enum',
  ]),
  required: z.boolean(),
  unique: z.boolean().optional(),
  default: z.unknown().optional(),
  indexed: z.boolean().optional(),
  description: z.string(),
  references: z.object({
    table: z.string(),
    column: z.string(),
    onDelete: z.enum(['CASCADE', 'SET_NULL', 'RESTRICT', 'NO_ACTION']),
  }).optional(),
  enumValues: z.array(z.string()).optional(),
});

export const DBIndexSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean(),
  type: z.enum(['btree', 'hash', 'gin']).optional(),
});

export const DBTableSchema = z.object({
  name: z.string(),
  description: z.string(),
  columns: z.array(DBColumnSchema),
  indexes: z.array(DBIndexSchema),
  constraints: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['PRIMARY_KEY', 'UNIQUE', 'CHECK', 'FOREIGN_KEY']),
      definition: z.string(),
    })
  ),
  auditFields: z.boolean().describe('Whether table has createdAt/updatedAt'),
  softDelete: z.boolean().describe('Whether table has deletedAt for soft deletion'),
});

export const DBSchema = z.object({
  dialect: z.enum(['postgresql', 'mysql', 'sqlite']),
  tables: z.array(DBTableSchema),
  enums: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.string()),
    })
  ),
  sharedColumns: z.array(
    z.object({
      name: z.string(),
      definition: z.string(),
      usedIn: z.array(z.string()),
    })
  ),
});

export type DBSchema = z.infer<typeof DBSchema>;
export type DBTable = z.infer<typeof DBTableSchema>;

// Auth Schema
export const RBACRuleSchema = z.object({
  role: z.string(),
  resource: z.string(),
  actions: z.array(z.string()),
  conditions: z.array(z.string()).optional(),
});

export const AuthPermissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  resource: z.string(),
  actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'manage', 'execute'])),
});

export const AuthProtectedResourceSchema = z.object({
  type: z.enum(['page', 'api_endpoint', 'component', 'data_field', 'dashboard_widget']),
  identifier: z.string(),
  rolesAllowed: z.array(z.string()),
  permissionRequired: z.string().optional(),
});

export const AuthSchema = z.object({
  strategy: z.enum(['jwt', 'session', 'oauth', 'magic_link', 'api_key']),
  roles: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      level: z.number(),
      isDefault: z.boolean(),
    })
  ),
  permissions: z.array(AuthPermissionSchema),
  rbacMatrix: z.array(RBACRuleSchema),
  protectedResources: z.array(AuthProtectedResourceSchema),
  sessionConfig: z.object({
    tokenExpiry: z.string(),
    refreshExpiry: z.string(),
    storage: z.enum(['cookie', 'localStorage', 'httpOnly']),
    secure: z.boolean(),
    sameSite: z.enum(['strict', 'lax', 'none']),
  }),
  passwordPolicy: z.object({
    minLength: z.number(),
    requireUppercase: z.boolean(),
    requireLowercase: z.boolean(),
    requireNumbers: z.boolean(),
    requireSpecialChars: z.boolean(),
  }),
});

export type AuthSchema = z.infer<typeof AuthSchema>;

// Business Logic Schema
export const BusinessRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  trigger: z.enum(['on_create', 'on_update', 'on_delete', 'on_read', 'on_schedule', 'on_event']),
  condition: z.string().describe('When this rule activates'),
  action: z.string().describe('What the rule does'),
  priority: z.number(),
  entity: z.string().optional(),
});

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  assignee: z.string().describe('Role or system that performs this step'),
  conditions: z.array(z.string()).describe('Conditions to proceed'),
  transitions: z.array(
    z.object({
      target: z.string(),
      condition: z.string(),
      action: z.string(),
    })
  ),
  timeout: z.string().optional(),
  onTimeout: z.string().optional(),
});

export const FeatureFlagSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabledByDefault: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100),
  targetRoles: z.array(z.string()).optional(),
  targetPlans: z.array(z.string()).optional(),
});

export const BillingConfigSchema = z.object({
  provider: z.string(),
  model: z.enum(['subscription', 'usage_based', 'freemium', 'one_time']),
  plans: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
      interval: z.enum(['monthly', 'yearly', 'one_time']),
      features: z.array(z.string()),
      limits: z.record(z.number()).describe('Resource limits per plan'),
      stripePriceId: z.string().optional(),
    })
  ),
  trialConfig: z.object({
    enabled: z.boolean(),
    durationDays: z.number(),
    features: z.array(z.string()),
  }).optional(),
  webhookEvents: z.array(z.string()),
});

export const BusinessLogicSchema = z.object({
  rules: z.array(BusinessRuleSchema),
  workflows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      entity: z.string(),
      initialStep: z.string(),
      steps: z.array(WorkflowStepSchema),
    })
  ),
  featureFlags: z.array(FeatureFlagSchema),
  billing: z.object({
    enabled: z.boolean(),
    config: BillingConfigSchema.optional(),
  }),
  premiumGating: z.array(
    z.object({
      feature: z.string(),
      requiredPlan: z.string(),
      fallbackBehavior: z.string(),
    })
  ),
  lifecycleHooks: z.array(
    z.object({
      event: z.string(),
      handler: z.string(),
      description: z.string(),
    })
  ),
  analyticsPermissions: z.array(
    z.object({
      dashboard: z.string(),
      rolesAllowed: z.array(z.string()),
      dataAccess: z.string(),
    })
  ),
});

export type BusinessLogicSchema = z.infer<typeof BusinessLogicSchema>;

// ============================================================
// Stage 4: Validation & Repair Types
// ============================================================

export const ValidationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  layer: z.enum(['ui', 'api', 'db', 'auth', 'business_logic', 'cross_layer']),
  category: z.enum([
    'missing_field',
    'type_mismatch',
    'reference_not_found',
    'orphaned_resource',
    'contradiction',
    'hallucinated_field',
    'broken_dependency',
    'invalid_workflow',
    'missing_auth',
    'enum_mismatch',
    'missing_relation',
    'impossible_flow',
  ]),
  description: z.string(),
  affectedFields: z.array(z.string()),
  suggestion: z.string(),
  autoRepairable: z.boolean(),
  repairedBy: z.enum(['none', 'auto_map', 'regenerate_layer', 'add_field', 'remove_field', 'update_reference']).optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const RepairActionSchema = z.object({
  issueId: z.string(),
  action: z.enum(['auto_map', 'regenerate_component', 'add_missing', 'remove_orphan', 'update_reference', 'no_fix']),
  targetLayer: z.enum(['ui', 'api', 'db', 'auth', 'business_logic']),
  targetComponent: z.string(),
  changes: z.array(
    z.object({
      field: z.string(),
      oldValue: z.unknown(),
      newValue: z.unknown(),
      reason: z.string(),
    })
  ),
  success: z.boolean(),
  description: z.string(),
});

export type RepairAction = z.infer<typeof RepairActionSchema>;

// ============================================================
// Pipeline Result & Metrics
// ============================================================

export const StageResultSchema = z.object({
  stage: z.number(),
  name: z.string(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'repaired']),
  output: z.unknown().optional(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  latencyMs: z.number(),
  tokenUsage: z.number(),
  retries: z.number(),
});

export type StageResult = z.infer<typeof StageResultSchema>;

export const PipelineResultSchema = z.object({
  id: z.string(),
  input: z.string(),
  intent: IntentSchema.optional(),
  architecture: ArchitectureSchema.optional(),
  uiSchema: UISchema.optional(),
  apiSchema: APISchema.optional(),
  dbSchema: DBSchema.optional(),
  authSchema: AuthSchema.optional(),
  businessLogic: BusinessLogicSchema.optional(),
  validationIssues: z.array(ValidationIssueSchema),
  repairActions: z.array(RepairActionSchema),
  stages: z.array(StageResultSchema),
  finalStatus: z.enum(['success', 'partial', 'failed']),
  totalLatencyMs: z.number(),
  totalTokens: z.number(),
  createdAt: z.string(),
});

export type PipelineResult = z.infer<typeof PipelineResultSchema>;

export const BenchmarkResultSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  category: z.enum(['real_product', 'edge_case']),
  subcategory: z.string(),
  pipelineResult: PipelineResultSchema,
  metrics: z.object({
    success: z.boolean(),
    totalLatencyMs: z.number(),
    totalTokens: z.number(),
    validationErrors: z.number(),
    repairActions: z.number(),
    stagesCompleted: z.number(),
    consistencyScore: z.number().min(0).max(1),
    executionSuccess: z.boolean(),
  }),
  createdAt: z.string(),
});

export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
