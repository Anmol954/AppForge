/**
 * Demo Mode - Pre-built Responses for Pipeline Stages
 *
 * Used when OPENAI_API_KEY is not configured.
 */

interface AppProfile {
  type: string;
  name: string;
  entities: string[];
  features: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
}

function detectAppProfile(prompt: string): AppProfile {
  const p = prompt.toLowerCase();

  if (p.includes('crm') || (p.includes('contact') && p.includes('deal'))) {
    return {
      type: 'CRM',
      name: 'CRM Pro',
      entities: ['User', 'Contact', 'Organization', 'Deal'],
      features: ['authentication', 'authorization', 'reporting', 'data_management', 'search', 'ui'],
      complexity: 'moderate',
    };
  }

  if (p.includes('shop') || p.includes('e-commerce') || p.includes('ecommerce')) {
    return {
      type: 'E-commerce',
      name: 'ShopForge',
      entities: ['User', 'Product', 'Order', 'Payment'],
      features: ['authentication', 'data_management', 'billing', 'workflow', 'search', 'ui'],
      complexity: 'complex',
    };
  }

  if (p.includes('lms') || p.includes('course') || p.includes('learning')) {
    return {
      type: 'LMS',
      name: 'LearnHub',
      entities: ['User', 'Course', 'Lesson', 'Enrollment'],
      features: ['authentication', 'authorization', 'data_management', 'workflow', 'reporting', 'ui'],
      complexity: 'complex',
    };
  }

  return {
    type: 'SaaS Application',
    name: 'AppPlatform',
    entities: ['User', 'Resource', 'Activity'],
    features: ['authentication', 'authorization', 'data_management', 'ui'],
    complexity: 'moderate',
  };
}

function pluralize(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('s')) return w;
  return `${w}s`;
}

function generateIntentDemo(prompt: string): object {
  const profile = detectAppProfile(prompt);

  return {
    productType: profile.type,
    productName: profile.name,
    features: profile.features.map((cat, i) => ({
      id: `feat-${String(i + 1).padStart(3, '0')}`,
      name: cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `${cat.replace(/_/g, ' ')} capabilities`,
      priority: i < 2 ? 'critical' : i < 4 ? 'high' : 'medium',
      category: cat,
      dependencies: i > 0 ? ['feat-001'] : [],
    })),
    actors: [
      { id: 'actor-001', name: 'Admin', description: 'System administrator', role: 'admin', permissions: ['read', 'write', 'delete'] },
      { id: 'actor-002', name: 'User', description: 'Standard user', role: 'user', permissions: ['read', 'write'] },
      { id: 'actor-003', name: 'Guest', description: 'Unauthenticated user', role: 'guest', permissions: ['read'] },
    ],
    entities: profile.entities.map((name, i) => ({
      id: `entity-${String(i + 1).padStart(3, '0')}`,
      name,
      description: `${name} entity`,
      attributes: [
        { name: 'id', type: 'string', required: true, description: 'Primary key' },
        { name: 'name', type: 'string', required: true, description: `${name} name` },
        { name: 'createdAt', type: 'datetime', required: true, description: 'Created timestamp' },
      ],
      relationships: i > 0 ? [{ target: 'User', type: 'one_to_many', description: `${name} belongs to user` }] : [],
    })),
    constraints: [
      { id: 'constraint-001', type: 'security', description: 'Protected routes require auth', severity: 'blocking' },
      { id: 'constraint-002', type: 'business_rule', description: 'Role-based access control enabled', severity: 'blocking' },
    ],
    integrations: prompt.toLowerCase().includes('stripe')
      ? [{ name: 'Stripe', purpose: 'Payment processing', type: 'payment', required: true }]
      : [],
    assumptions: [
      { id: 'assumption-001', description: 'Web app with React frontend', confidence: 'high', rationale: 'Default platform choice' },
      { id: 'assumption-002', description: 'Relational database backend', confidence: 'medium', rationale: 'Works for most CRUD products' },
    ],
    summary: `${profile.type} app with ${profile.entities.length} entities and ${profile.features.length} feature groups.`,
    complexity: profile.complexity,
  };
}

function generateArchitectureDemo(prompt: string): object {
  const profile = detectAppProfile(prompt);
  const mainEntity = profile.entities[1] || 'Resource';
  const mainEntityPlural = pluralize(mainEntity);

  return {
    architecturalReasoning: `Modular monolith for ${profile.type} to keep delivery fast with clear module boundaries.`,
    domainModel: profile.entities.map((e) => ({
      entity: e,
      services: [`${e}Service`],
      workflows: e === 'User' ? ['registration', 'authentication'] : [`${e.toLowerCase()}_crud`],
    })),
    serviceBoundaries: [
      {
        name: 'AuthService',
        responsibility: 'Authentication and authorization',
        ownsEntities: ['User'],
        exposesEndpoints: ['/api/v1/auth/login', '/api/v1/auth/register'],
        dependsOn: [],
      },
      {
        name: 'CoreService',
        responsibility: `${profile.type} domain operations`,
        ownsEntities: profile.entities.filter((e) => e !== 'User'),
        exposesEndpoints: [`/api/v1/${mainEntityPlural}`],
        dependsOn: ['AuthService'],
      },
    ],
    frontendStructure: [
      { name: 'AuthModule', route: '/auth', components: ['LoginForm'], stateRequirements: ['authToken'], authRequired: false, rolesAllowed: ['guest'] },
      { name: 'DashboardModule', route: '/dashboard', components: ['MetricCards'], stateRequirements: ['dashboardMetrics'], authRequired: true, rolesAllowed: ['admin', 'user'] },
      { name: 'DataModule', route: `/${mainEntityPlural}`, components: ['DataTable', 'CreateForm'], stateRequirements: [`${mainEntityPlural}List`], authRequired: true, rolesAllowed: ['admin', 'user'] },
    ],
    backendModules: [
      {
        name: 'AuthModule',
        responsibility: 'Login and session operations',
        endpoints: [
          { method: 'POST', path: '/api/v1/auth/login', description: 'Authenticate user', authRequired: false },
          { method: 'POST', path: '/api/v1/auth/register', description: 'Register user', authRequired: false },
        ],
        dataAccess: ['User'],
        events: ['user.login', 'user.register'],
      },
      {
        name: 'ResourceModule',
        responsibility: `${mainEntity} CRUD operations`,
        endpoints: [
          { method: 'GET', path: `/api/v1/${mainEntityPlural}`, description: `List ${mainEntityPlural}`, authRequired: true },
          { method: 'POST', path: `/api/v1/${mainEntityPlural}`, description: `Create ${mainEntity}`, authRequired: true },
          { method: 'DELETE', path: `/api/v1/${mainEntityPlural}/:id`, description: `Delete ${mainEntity}`, authRequired: true },
        ],
        dataAccess: [mainEntity],
        events: [`${mainEntity.toLowerCase()}.created`],
      },
    ],
    authFlow: {
      strategy: 'jwt',
      provider: 'custom',
      tokenStorage: 'httpOnly',
      refreshMechanism: 'Rolling refresh token',
      mfa: false,
    },
    apiMap: [
      { endpoint: '/api/v1/auth/login', service: 'AuthService', version: 'v1', deprecated: false },
      { endpoint: `/api/v1/${mainEntityPlural}`, service: 'CoreService', version: 'v1', deprecated: false },
    ],
    stateManagement: {
      globalState: [
        { name: 'currentUser', type: 'User | null', source: 'server', persistence: 'memory' },
        { name: 'theme', type: 'light | dark', source: 'client', persistence: 'localStorage' },
      ],
      serverState: [
        { name: `${mainEntityPlural}List`, staleTime: '15s', cacheStrategy: 'stale_while_revalidate' },
      ],
    },
    dependencyGraph: [
      { from: 'CoreService', to: 'AuthService', type: 'sync' },
      { from: 'DashboardModule', to: 'CoreService', type: 'async' },
    ],
    featureOwnership: profile.features.map((f) => ({
      feature: f,
      frontendModule: f === 'authentication' ? 'AuthModule' : 'DataModule',
      backendModule: f === 'authentication' ? 'AuthModule' : 'ResourceModule',
      service: f === 'authentication' ? 'AuthService' : 'CoreService',
    })),
  };
}

function generateSchemasDemo(prompt: string): object {
  const profile = detectAppProfile(prompt);
  const mainEntity = profile.entities[1] || 'Resource';
  const e = mainEntity.toLowerCase();
  const ep = pluralize(mainEntity);

  return {
    uiSchema: {
      pages: [
        {
          id: 'page-login', name: 'Login', route: '/auth/login', layout: 'modal', authRequired: false, rolesAllowed: ['guest'],
          forms: [{
            id: 'form-login', name: 'Login Form', action: '/api/v1/auth/login', method: 'POST',
            fields: [
              { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com', apiField: 'email' },
              { name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'password', apiField: 'password' },
            ],
            submitLabel: 'Sign In',
          }],
          tables: [], dashboards: [], loadingStates: ['Signing in'], errorStates: [{ scenario: 'invalid_credentials', message: 'Invalid credentials', action: 'retry' }],
        },
        {
          id: 'page-dashboard', name: 'Dashboard', route: '/dashboard', layout: 'dashboard', authRequired: true, rolesAllowed: ['admin', 'user'],
          forms: [],
          tables: [],
          dashboards: [{
            id: 'dash-main', name: 'Overview',
            widgets: [{ id: 'widget-summary', type: 'metric_card', title: `Total ${ep}`, dataSource: `/api/v1/${ep}`, size: 'md' }],
          }],
          loadingStates: ['Loading dashboard'],
          errorStates: [{ scenario: 'dashboard_fetch_failed', message: 'Failed to load dashboard', action: 'retry' }],
        },
        {
          id: `page-${ep}`, name: ep, route: `/${ep}`, layout: 'sidebar', authRequired: true, rolesAllowed: ['admin', 'user'],
          forms: [{
            id: `form-${e}`, name: `Create ${mainEntity}`, action: `/api/v1/${ep}`, method: 'POST',
            fields: [
              { name: 'name', label: 'Name', type: 'text', required: true, placeholder: `Enter ${e} name`, apiField: 'name' },
              { name: 'description', label: 'Description', type: 'textarea', required: false, placeholder: 'Optional', apiField: 'description' },
            ],
            submitLabel: 'Create',
          }],
          tables: [{
            id: `table-${ep}`, name: `${mainEntity} Table`, dataSource: `/api/v1/${ep}`,
            columns: [
              { key: 'name', label: 'Name', sortable: true, filterable: true, type: 'text', apiField: 'name' },
              { key: 'createdAt', label: 'Created', sortable: true, filterable: false, type: 'date', apiField: 'createdAt' },
            ],
            pagination: true, searchable: true, rowActions: ['edit', 'delete'], bulkActions: ['delete_selected'],
          }],
          dashboards: [], loadingStates: ['Loading data'], errorStates: [{ scenario: 'fetch_failed', message: 'Failed to load data', action: 'retry' }],
        },
      ],
      layouts: [{ id: 'layout-main', name: 'Main Layout', sections: ['header', 'sidebar', 'content'] }],
      navigation: {
        items: [
          { label: 'Dashboard', route: '/dashboard', icon: 'LayoutDashboard', rolesAllowed: ['admin', 'user'] },
          { label: ep, route: `/${ep}`, icon: 'Database', rolesAllowed: ['admin', 'user'] },
        ],
        breadcrumbRoot: 'Home',
      },
      reusableComponents: [
        { id: 'comp-nav', name: 'Sidebar Navigation', type: 'sidebar', props: {}, reusable: true },
        { id: 'comp-toast', name: 'Toast', type: 'toast', props: {}, reusable: true },
      ],
      protectedRoutes: [
        { route: '/dashboard', roles: ['admin', 'user'], redirect: '/auth/login' },
        { route: `/${ep}`, roles: ['admin', 'user'], redirect: '/auth/login' },
      ],
    },
    apiSchema: {
      version: 'v1',
      basePath: '/api',
      endpoints: [
        {
          id: 'api-login', method: 'POST', path: '/api/v1/auth/login', summary: 'Login', description: 'Authenticate user', params: [],
          requestBody: { contentType: 'application/json', fields: [{ name: 'email', type: 'string', required: true, description: 'Email' }, { name: 'password', type: 'string', required: true, description: 'Password' }] },
          responses: [{ statusCode: 200, description: 'Authenticated', schema: { token: 'string' } }],
          authRequired: false, requiredRoles: [], rateLimit: { maxRequests: 20, windowMs: 60000 },
          dbOperation: { table: 'users', type: 'INSERT', fields: ['email', 'password_hash'] },
        },
        {
          id: `api-list-${ep}`, method: 'GET', path: `/api/v1/${ep}`, summary: `List ${ep}`, description: `Get all ${ep}`,
          params: [{ name: 'page', type: 'integer', in: 'query', required: false, description: 'Page number' }],
          responses: [{ statusCode: 200, description: 'Success', schema: { data: 'array', total: 'number' } }],
          authRequired: true, requiredRoles: ['admin', 'user'], rateLimit: { maxRequests: 100, windowMs: 60000 },
          pagination: { supported: true, defaultLimit: 20, maxLimit: 100, cursorBased: false },
          dbOperation: { table: ep, type: 'SELECT', fields: ['id', 'name', 'description', 'created_at'] },
        },
        {
          id: `api-create-${e}`, method: 'POST', path: `/api/v1/${ep}`, summary: `Create ${mainEntity}`, description: `Create ${mainEntity}`, params: [],
          requestBody: { contentType: 'application/json', fields: [{ name: 'name', type: 'string', required: true, description: 'Name' }, { name: 'description', type: 'string', required: false, description: 'Description' }] },
          responses: [{ statusCode: 201, description: 'Created', schema: { id: 'string' } }],
          authRequired: true, requiredRoles: ['admin', 'user'], rateLimit: { maxRequests: 50, windowMs: 60000 },
          dbOperation: { table: ep, type: 'INSERT', fields: ['name', 'description', 'user_id'] },
        },
        {
          id: `api-delete-${e}`, method: 'DELETE', path: `/api/v1/${ep}/{id}`, summary: `Delete ${mainEntity}`, description: `Delete ${mainEntity}`,
          params: [{ name: 'id', type: 'uuid', in: 'path', required: true, description: `${mainEntity} id` }],
          responses: [{ statusCode: 200, description: 'Deleted', schema: { success: true } }],
          authRequired: true, requiredRoles: ['admin'], rateLimit: { maxRequests: 30, windowMs: 60000 },
          dbOperation: { table: ep, type: 'DELETE', fields: ['id'] },
        },
      ],
      sharedTypes: [{ name: 'PaginationMeta', definition: { page: 'number', limit: 'number', total: 'number' } }],
      errorResponses: [
        { code: 400, name: 'BadRequest', description: 'Invalid input', fields: ['message'] },
        { code: 401, name: 'Unauthorized', description: 'Authentication required', fields: ['message'] },
      ],
    },
    dbSchema: {
      dialect: 'postgresql',
      tables: [
        {
          name: 'users', description: 'Application users',
          columns: [
            { name: 'id', type: 'String', required: true, unique: true, description: 'Primary key' },
            { name: 'email', type: 'String', required: true, unique: true, indexed: true, description: 'Email' },
            { name: 'password_hash', type: 'String', required: true, description: 'Hashed password' },
            { name: 'name', type: 'String', required: true, description: 'Display name' },
            { name: 'role', type: 'Enum', required: true, description: 'Role', enumValues: ['admin', 'user', 'guest'] },
            { name: 'created_at', type: 'DateTime', required: true, description: 'Created at' },
          ],
          indexes: [{ name: 'idx_users_email', columns: ['email'], unique: true }],
          constraints: [{ name: 'pk_users', type: 'PRIMARY_KEY', definition: 'PRIMARY KEY (id)' }],
          auditFields: true,
          softDelete: false,
        },
        {
          name: ep, description: `${mainEntity} records`,
          columns: [
            { name: 'id', type: 'String', required: true, unique: true, description: 'Primary key' },
            { name: 'name', type: 'String', required: true, description: `${mainEntity} name` },
            { name: 'description', type: 'String', required: false, description: 'Description' },
            { name: 'user_id', type: 'String', required: true, description: 'Owner id', references: { table: 'users', column: 'id', onDelete: 'CASCADE' } },
            { name: 'created_at', type: 'DateTime', required: true, description: 'Created at' },
          ],
          indexes: [{ name: `idx_${ep}_user`, columns: ['user_id'], unique: false }],
          constraints: [{ name: `pk_${ep}`, type: 'PRIMARY_KEY', definition: 'PRIMARY KEY (id)' }],
          auditFields: true,
          softDelete: false,
        },
      ],
      enums: [{ name: 'UserRole', values: ['admin', 'user', 'guest'] }],
      sharedColumns: [{ name: 'audit_timestamps', definition: 'created_at TIMESTAMP, updated_at TIMESTAMP', usedIn: ['users', ep] }],
    },
    authSchema: {
      strategy: 'jwt',
      roles: [
        { name: 'admin', description: 'Administrator', level: 100, isDefault: false },
        { name: 'user', description: 'Standard user', level: 50, isDefault: true },
        { name: 'guest', description: 'Guest user', level: 10, isDefault: false },
      ],
      permissions: [
        { id: 'perm-001', name: `Manage ${ep}`, description: `${mainEntity} CRUD`, resource: `/api/v1/${ep}`, actions: ['create', 'read', 'update', 'delete'] },
        { id: 'perm-002', name: 'View Dashboard', description: 'Dashboard access', resource: '/dashboard', actions: ['read'] },
      ],
      rbacMatrix: [
        { role: 'admin', resource: `/api/v1/${ep}`, actions: ['create', 'read', 'update', 'delete'] },
        { role: 'admin', resource: `/api/v1/${ep}/{id}`, actions: ['delete'] },
        { role: 'user', resource: `/api/v1/${ep}`, actions: ['create', 'read', 'update'] },
      ],
      protectedResources: [
        { type: 'page', identifier: '/dashboard', rolesAllowed: ['admin', 'user'] },
        { type: 'page', identifier: `/${ep}`, rolesAllowed: ['admin', 'user'] },
        { type: 'api_endpoint', identifier: `/api/v1/${ep}`, rolesAllowed: ['admin', 'user'] },
      ],
      sessionConfig: { tokenExpiry: '24h', refreshExpiry: '7d', storage: 'httpOnly', secure: true, sameSite: 'lax' },
      passwordPolicy: { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: false },
    },
    businessLogic: {
      rules: [
        { id: 'rule-001', name: 'Ownership Rule', description: `Users can only read their own ${ep}`, trigger: 'on_read', condition: 'user.role !== admin', action: 'filter by user_id', priority: 1, entity: ep },
      ],
      workflows: [
        {
          id: 'wf-001', name: `${mainEntity} Lifecycle`, description: `${mainEntity} creation flow`, entity: ep, initialStep: 'step-1',
          steps: [
            { id: 'step-1', name: 'Validate Input', description: 'Validate request payload', assignee: 'system', conditions: ['name_present'], transitions: [{ target: 'step-2', condition: 'valid', action: 'proceed' }] },
            { id: 'step-2', name: 'Persist Record', description: 'Insert row in DB', assignee: 'system', conditions: ['db_available'], transitions: [] },
          ],
        },
      ],
      featureFlags: [
        { id: 'ff-001', name: 'ANALYTICS_DASHBOARD', description: 'Enable analytics widgets', enabledByDefault: true, rolloutPercentage: 100, targetRoles: ['admin'] },
      ],
      billing: {
        enabled: profile.features.includes('billing'),
        config: profile.features.includes('billing')
          ? {
            provider: 'stripe',
            model: 'subscription',
            plans: [
              {
                name: 'Pro',
                price: 29,
                interval: 'monthly',
                features: ['advanced_reports', 'priority_support'],
                limits: { projects: 50, members: 25 },
                stripePriceId: 'price_demo_pro',
              },
            ],
            trialConfig: {
              enabled: true,
              durationDays: 14,
              features: ['advanced_reports'],
            },
            webhookEvents: ['invoice.paid', 'customer.subscription.deleted'],
          }
          : undefined,
      },
      premiumGating: [
        { feature: 'advanced_reports', requiredPlan: 'Pro', fallbackBehavior: 'show_upgrade_modal' },
      ],
      lifecycleHooks: [
        { event: `${e}.created`, handler: 'auditCreate', description: 'Record audit log on create' },
      ],
      analyticsPermissions: [
        { dashboard: 'main', rolesAllowed: ['admin'], dataAccess: 'full' },
      ],
    },
  };
}

export function getDemoResponse(prompt: string, schemaDescription: string): string {
  const desc = schemaDescription.toLowerCase();

  if (
    desc.includes('serviceboundaries') ||
    desc.includes('frontendstructure') ||
    desc.includes('architecturalreasoning') ||
    desc.includes('dependencygraph')
  ) {
    return JSON.stringify(generateArchitectureDemo(prompt));
  }

  if (
    desc.includes('uischema') ||
    desc.includes('apischema') ||
    desc.includes('dbschema') ||
    desc.includes('authschema') ||
    desc.includes('businesslogic')
  ) {
    return JSON.stringify(generateSchemasDemo(prompt));
  }

  return JSON.stringify(generateIntentDemo(prompt));
}

export function isDemoMode(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '';
}
