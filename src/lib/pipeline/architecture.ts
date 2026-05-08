/**
 * Stage 2 — Architecture Planning
 *
 * WHY: A structured Intent alone isn't enough to build software. This stage
 * acts as a compiler's semantic analyzer — it takes the flat list of entities,
 * features, and actors and resolves them into a concrete system architecture
 * with service boundaries, API contracts, and module decomposition.
 *
 * DESIGN DECISIONS:
 * - Temperature 0: Architecture decisions must be deterministic and reproducible.
 *   The same Intent must always produce the same Architecture.
 * - Service boundaries derived from entities: Group related entities under
 *   cohesive service boundaries following domain-driven design principles.
 * - Auth flow as a first-class concern: Security is too critical to be an
 *   afterthought, so we extract the auth strategy explicitly.
 * - Dependency graph: Making inter-module dependencies explicit enables
 *   downstream code generation to produce correct import orderings.
 */

import type { Intent, Architecture, StageResult } from './types';
import { ArchitectureSchema } from './types';
import { structuredGenerate } from './llm';

// ============================================================
// Schema Description for LLM
// ============================================================

const ARCHITECTURE_SCHEMA_DESCRIPTION = `
{
  "architecturalReasoning": "string — Detailed explanation of WHY this architecture pattern was chosen over alternatives. Must reference the product type, complexity, and specific requirements from the intent.",

  "domainModel": [{
    "entity": "string — Entity name from the intent",
    "services": ["string — Which services own/manipulate this entity"],
    "workflows": ["string — Which workflows involve this entity"]
  }],

  "serviceBoundaries": [{
    "name": "string — Service name (e.g., 'AuthService', 'OrderService')",
    "responsibility": "string — What this service is responsible for",
    "ownsEntities": ["string — Names of entities this service owns"],
    "exposesEndpoints": ["string — API endpoint patterns this service exposes (e.g., '/api/auth/*', '/api/orders/*')"],
    "dependsOn": ["string — Names of other services this depends on"]
  }],

  "frontendStructure": [{
    "name": "string — Module name (e.g., 'AuthModule', 'DashboardModule')",
    "route": "string — Route path (e.g., '/auth/login', '/dashboard')",
    "components": ["string — Key UI components in this module"],
    "stateRequirements": ["string — What state this module needs"],
    "authRequired": "boolean — Whether authentication is required",
    "rolesAllowed": ["string — Roles that can access this module, empty array means all authenticated users"]
  }],

  "backendModules": [{
    "name": "string — Module name (e.g., 'AuthModule', 'UserModule')",
    "responsibility": "string — What this module handles",
    "endpoints": [{
      "method": "'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'",
      "path": "string — API path (e.g., '/api/users/:id')",
      "description": "string — What this endpoint does",
      "authRequired": "boolean"
    }],
    "dataAccess": ["string — Which entities/tables this module reads/writes"],
    "events": ["string — Domain events this module publishes or subscribes to"]
  }],

  "authFlow": {
    "strategy": "'jwt' | 'session' | 'oauth' | 'magic_link'",
    "provider": "string — Auth provider name (e.g., 'NextAuth.js', 'Clerk', 'Auth0', 'custom')",
    "tokenStorage": "'cookie' | 'localStorage' | 'httpOnly'",
    "refreshMechanism": "string — How token refresh works (e.g., 'Silent refresh via httpOnly refresh token cookie')",
    "mfa": "boolean — Whether multi-factor authentication is supported"
  },

  "apiMap": [{
    "endpoint": "string — Full endpoint path (e.g., 'GET /api/users')",
    "service": "string — Owning service name",
    "version": "string — API version (e.g., 'v1')",
    "deprecated": "boolean"
  }],

  "stateManagement": {
    "globalState": [{
      "name": "string — State slice name (e.g., 'auth', 'theme', 'cart')",
      "type": "string — TypeScript type or description",
      "source": "'server' | 'client' | 'hybrid'",
      "persistence": "'memory' | 'localStorage' | 'sessionStorage' | 'database'"
    }],
    "serverState": [{
      "name": "string — Server state query name (e.g., 'users', 'orders')",
      "staleTime": "string — How long data is considered fresh (e.g., '5 minutes')",
      "cacheStrategy": "'stale_while_revalidate' | 'cache_first' | 'network_only'"
    }]
  },

  "dependencyGraph": [{
    "from": "string — Source module/service name",
    "to": "string — Target module/service name",
    "type": "'sync' | 'async' | 'event'"
  }],

  "featureOwnership": [{
    "feature": "string — Feature name from the intent",
    "frontendModule": "string — Which frontend module implements this feature",
    "backendModule": "string — Which backend module implements this feature",
    "service": "string — Which service owns this feature"
  }]
}`;

// ============================================================
// Prompt Builder
// ============================================================

function buildArchitecturePrompt(intent: Intent): string {
  return `You are a senior software architect tasked with designing a system architecture based on a structured product intent.

## PRODUCT INTENT:

### Product: ${intent.productName} (${intent.productType})
Complexity: ${intent.complexity}
Summary: ${intent.summary}

### Features (${intent.features.length}):
${intent.features.map((f) => `- [${f.id}] ${f.name} (${f.priority}, ${f.category}) — ${f.description}${f.dependencies.length > 0 ? ` | Depends on: ${f.dependencies.join(', ')}` : ''}`).join('\n')}

### Actors (${intent.actors.length}):
${intent.actors.map((a) => `- [${a.id}] ${a.name} (${a.role}) — ${a.description} | Permissions: ${a.permissions.join(', ')}`).join('\n')}

### Entities (${intent.entities.length}):
${intent.entities.map((e) => {
  const attrs = e.attributes.map((a) => `${a.name}:${a.type}${a.required ? '(required)' : ''}`).join(', ');
  const rels = e.relationships.map((r) => `→${r.target}(${r.type})`).join(', ');
  return `- [${e.id}] ${e.name} — ${e.description} | Attrs: [${attrs}] | Relations: [${rels}]`;
}).join('\n')}

### Constraints (${intent.constraints.length}):
${intent.constraints.map((c) => `- [${c.id}] ${c.type} (${c.severity}): ${c.description}`).join('\n')}

### Integrations (${intent.integrations.length}):
${intent.integrations.map((i) => `- ${i.name} (${i.type}, ${i.required ? 'required' : 'optional'}): ${i.purpose}`).join('\n')}

### Assumptions (${intent.assumptions.length}):
${intent.assumptions.map((a) => `- [${a.id}] (${a.confidence}): ${a.description} — ${a.rationale}`).join('\n')}

---

## YOUR TASKS:

### 1. Architectural Reasoning
Explain your architecture choice in detail. Reference:
- The product type and complexity level
- Key constraints and integrations
- Why monolith vs microservices (or modular monolith) was chosen
- Why specific patterns (CQRS, event-driven, etc.) were selected or rejected

### 2. Domain Model Mapping
Map every entity from the intent to the services and workflows that involve it.
Every entity MUST appear in the domain model.

### 3. Service Boundaries
Design service boundaries by grouping related entities and features:
- Each service should have a single, clear responsibility
- Services must own their entities exclusively (no shared ownership)
- List the API endpoints each service exposes (use glob patterns like '/api/users/*')
- Document dependencies between services
- Aim for 2-6 services for moderate complexity, more for complex/enterprise

### 4. Frontend Module Structure
Design the frontend as a set of page-level modules:
- Each module maps to a route and contains key components
- Specify what state each module needs
- Mark auth requirements and allowed roles
- Use standard route patterns: '/dashboard', '/settings', '/items/[id]', etc.
- Include common modules: landing page, dashboard, settings, profile

### 5. Backend Module Design
Define backend modules with endpoint skeletons:
- Each endpoint needs: method, path, description, auth requirement
- Use proper REST conventions: plural nouns, nested resources for relationships
- Specify which entities each module accesses
- List domain events the module publishes or handles
- Ensure every feature from the intent has at least one endpoint

### 6. Auth Flow Strategy
Choose and configure the authentication approach:
- For simple apps: session-based auth
- For SaaS/API: JWT with httpOnly cookies
- For B2C: OAuth (Google, GitHub)
- For developer tools: API key + JWT
- Always support refresh tokens
- Consider MFA based on complexity level

### 7. API Map
Create a comprehensive map of every endpoint:
- Include ALL endpoints from backend modules
- Assign to the owning service
- Use versioning (default 'v1')

### 8. State Management
Plan state management carefully:
- Global state: auth, theme, user preferences, cart (for e-commerce)
- Server state: data fetched from APIs that needs caching
- Use 'hybrid' source for state that's initialized from server but updated client-side
- Choose appropriate cache strategies based on data volatility

### 9. Dependency Graph
Build a complete dependency graph:
- Map sync dependencies (direct function calls)
- Map async dependencies (API calls between services)
- Map event dependencies (pub/sub, webhooks)
- Identify circular dependencies and break them

### 10. Feature Ownership
Map EVERY feature from the intent to its owning modules:
- Each feature must have a frontend module and backend module
- Each feature must be assigned to a service
- No feature should be orphaned

## CRITICAL RULES:
- Every entity from the intent MUST appear in the domain model and be owned by exactly one service.
- Every feature from the intent MUST have a feature ownership entry.
- Every actor's permissions MUST be reflected in endpoint auth requirements.
- Route paths MUST be consistent between frontendStructure and apiMap.
- Service boundaries MUST NOT overlap (no entity owned by two services).
- The dependency graph MUST NOT contain cycles.
- Backend endpoints must use RESTful conventions with proper HTTP methods.`;
}

// ============================================================
// Stage Execution
// ============================================================

/**
 * Stage 2: Plan system architecture from a validated Intent.
 *
 * Consumes the Intent IR produced by Stage 1 and produces an Architecture IR
 * that includes service decomposition, module structure, API contracts, and
 * dependency topology.
 */
export async function planArchitecture(
  intent: Intent
): Promise<{ architecture: Architecture; stageResult: StageResult }> {
  const startTime = Date.now();

  const stageResult: StageResult = {
    stage: 2,
    name: 'Architecture Planning',
    status: 'running',
    output: undefined,
    errors: [],
    warnings: [],
    latencyMs: 0,
    tokenUsage: 0,
    retries: 0,
  };

  try {
    // Guard: ensure intent has minimum required data
    if (intent.features.length === 0) {
      throw new Error(
        'Cannot plan architecture: intent has no features. Ensure Stage 1 (Intent Extraction) completed successfully.'
      );
    }
    if (intent.entities.length === 0) {
      throw new Error(
        'Cannot plan architecture: intent has no entities. Ensure Stage 1 (Intent Extraction) completed successfully.'
      );
    }

    const architecturePrompt = buildArchitecturePrompt(intent);

    const response = await structuredGenerate<Architecture>(
      architecturePrompt,
      ARCHITECTURE_SCHEMA_DESCRIPTION,
      {
        temperature: 0,
        maxTokens: 8192,
        maxRetries: 3,
      }
    );

    // Validate against the Zod schema
    const validationResult = ArchitectureSchema.safeParse(response.content);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );

      stageResult.status = 'failed';
      stageResult.errors = errorMessages;
      stageResult.latencyMs = Date.now() - startTime;
      stageResult.tokenUsage = response.usage.totalTokens;
      stageResult.retries = response.retries;

      throw new Error(
        `Architecture validation failed: ${errorMessages.join('; ')}`
      );
    }

    const architecture = validationResult.data;

    // Post-validation: cross-reference with intent for completeness
    const warnings: string[] = [];

    // Check that every entity has a domain model entry
    const domainEntityNames = new Set(architecture.domainModel.map((d) => d.entity));
    for (const entity of intent.entities) {
      if (!domainEntityNames.has(entity.name)) {
        warnings.push(
          `Entity "${entity.name}" from intent is not mapped in the domain model.`
        );
      }
    }

    // Check that every feature has ownership
    const ownedFeatures = new Set(architecture.featureOwnership.map((f) => f.feature));
    for (const feature of intent.features) {
      if (!ownedFeatures.has(feature.name)) {
        warnings.push(
          `Feature "${feature.name}" from intent has no feature ownership entry.`
        );
      }
    }

    // Check that dependency graph has no obvious cycles (simple heuristic)
    const depEdges = architecture.dependencyGraph;
    const edgeSet = new Set(depEdges.map((d) => `${d.from}->${d.to}`));
    for (const edge of depEdges) {
      if (edgeSet.has(`${edge.to}->${edge.from}`)) {
        warnings.push(
          `Potential bidirectional dependency detected between "${edge.from}" and "${edge.to}".`
        );
      }
    }

    // Check that every backend module has at least one endpoint
    for (const mod of architecture.backendModules) {
      if (mod.endpoints.length === 0) {
        warnings.push(
          `Backend module "${mod.name}" has no endpoints defined.`
        );
      }
    }

    stageResult.status = 'success';
    stageResult.output = architecture;
    stageResult.warnings = warnings;
    stageResult.latencyMs = Date.now() - startTime;
    stageResult.tokenUsage = response.usage.totalTokens;
    stageResult.retries = response.retries;

    return { architecture, stageResult };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during architecture planning';

    if (stageResult.status === 'running') {
      stageResult.status = 'failed';
    }
    stageResult.errors.push(errorMessage);
    stageResult.latencyMs = Date.now() - startTime;

    console.error(`[Stage 2] Architecture planning failed: ${errorMessage}`);

    // Return a minimal fallback architecture
    const fallbackArchitecture: Architecture = {
      architecturalReasoning: `Fallback: architecture planning failed. Reason: ${errorMessage}`,
      domainModel: intent.entities.map((e) => ({
        entity: e.name,
        services: ['FallbackService'],
        workflows: [],
      })),
      serviceBoundaries: [{
        name: 'FallbackService',
        responsibility: 'Fallback service due to planning failure',
        ownsEntities: intent.entities.map((e) => e.name),
        exposesEndpoints: [],
        dependsOn: [],
      }],
      frontendStructure: [],
      backendModules: [],
      authFlow: {
        strategy: 'jwt',
        provider: 'custom',
        tokenStorage: 'httpOnly',
        refreshMechanism: 'Standard JWT refresh',
        mfa: false,
      },
      apiMap: [],
      stateManagement: {
        globalState: [],
        serverState: [],
      },
      dependencyGraph: [],
      featureOwnership: intent.features.map((f) => ({
        feature: f.name,
        frontendModule: 'Unknown',
        backendModule: 'Unknown',
        service: 'FallbackService',
      })),
    };

    return { architecture: fallbackArchitecture, stageResult };
  }
}
