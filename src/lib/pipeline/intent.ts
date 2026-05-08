/**
 * Stage 1 — Intent Extraction
 *
 * WHY: Raw natural language prompts are ambiguous and incomplete.
 * This stage acts as a compiler's lexer/parser — it converts freeform text
 * into a structured, typed intermediate representation (Intent IR) that
 * downstream stages can reliably consume.
 *
 * DESIGN DECISIONS:
 * - Temperature 0: Determinism is paramount. The same prompt must always
 *   produce the same structured output so pipeline results are reproducible.
 * - Explicit assumptions: When the prompt is vague, we force the LLM to
 *   surface its assumptions rather than silently guessing. This makes the
 *   pipeline's behavior inspectable and debuggable.
 * - Unique IDs: Every feature, actor, entity, constraint gets a stable ID
 *   so that downstream architecture and schema stages can reference them.
 */

import type { Intent, StageResult } from './types';
import { IntentSchema, StageResultSchema } from './types';
import { structuredGenerate } from './llm';

// ============================================================
// LLM Output Normalization
// ============================================================

/** Map common LLM-generated relationship types to the accepted enum values */
const RELATIONSHIP_TYPE_ALIASES: Record<string, 'one_to_one' | 'one_to_many' | 'many_to_many'> = {
  // snake_case variants
  'has_one': 'one_to_one',
  'has_many': 'one_to_many',
  'belongs_to': 'one_to_many',
  'has_and_belongs_to_many': 'many_to_many',
  'many_to_one': 'one_to_many',
  'one-to-one': 'one_to_one',
  'one-to-many': 'one_to_many',
  'many-to-one': 'one_to_many',
  'many-to-many': 'many_to_many',
  '1:1': 'one_to_one',
  '1:n': 'one_to_many',
  '1:m': 'one_to_many',
  'n:1': 'one_to_many',
  'n:m': 'many_to_many',
  'n:n': 'many_to_many',
  // camelCase variants
  'hasOne': 'one_to_one',
  'hasMany': 'one_to_many',
  'belongsTo': 'one_to_many',
  'manyToOne': 'one_to_many',
  'oneToOne': 'one_to_one',
  'oneToMany': 'one_to_many',
  'manyToMany': 'many_to_many',
  'hasManyToMany': 'many_to_many',
};

/** Map common LLM-generated feature categories to accepted enum values */
const FEATURE_CATEGORY_ALIASES: Record<string, 'authentication' | 'authorization' | 'data_management' | 'reporting' | 'billing' | 'messaging' | 'search' | 'file_management' | 'workflow' | 'integration' | 'ui' | 'other'> = {
  'auth': 'authentication',
  'authentication': 'authentication',
  'authorization': 'authorization',
  'rbac': 'authorization',
  'access_control': 'authorization',
  'data': 'data_management',
  'crud': 'data_management',
  'reports': 'reporting',
  'analytics': 'reporting',
  'dashboards': 'reporting',
  'payment': 'billing',
  'payments': 'billing',
  'subscription': 'billing',
  'chat': 'messaging',
  'notifications': 'messaging',
  'email': 'messaging',
  'files': 'file_management',
  'storage': 'file_management',
  'uploads': 'file_management',
};

/** Map common LLM-generated actor roles to accepted enum values */
const ACTOR_ROLE_ALIASES: Record<string, 'admin' | 'manager' | 'user' | 'guest' | 'system' | 'custom'> = {
  'administrator': 'admin',
  'superadmin': 'admin',
  'super_admin': 'admin',
  'moderator': 'manager',
  'editor': 'manager',
  'member': 'user',
  'customer': 'user',
  'end_user': 'user',
  'anonymous': 'guest',
  'visitor': 'guest',
  'bot': 'system',
  'service': 'system',
};

/** Normalize an LLM-generated value against an alias map, with fallback */
function normalizeEnum<T extends string>(
  value: string,
  aliases: Record<string, T>,
  validValues: T[],
  fallback: T
): T {
  const key = value.toLowerCase().trim().replace(/[-\s]+/g, '_');
  return aliases[key] ?? (validValues.includes(value as T) ? (value as T) : fallback);
}

/** Normalize raw LLM JSON output before Zod validation */
function normalizeIntent(raw: unknown): Intent {
  const data = raw as Record<string, unknown>;

  // Normalize features
  if (Array.isArray(data.features)) {
    (data.features as Record<string, unknown>[]).forEach((f) => {
      if (typeof f.category === 'string') {
        f.category = normalizeEnum(
          f.category, FEATURE_CATEGORY_ALIASES,
          ['authentication', 'authorization', 'data_management', 'reporting', 'billing', 'messaging', 'search', 'file_management', 'workflow', 'integration', 'ui', 'other'],
          'other'
        );
      }
      if (typeof f.priority === 'string') {
        const p = f.priority.toLowerCase();
        if (!['critical', 'high', 'medium', 'low'].includes(p)) {
          f.priority = 'medium';
        }
      }
    });
  }

  // Normalize actors
  if (Array.isArray(data.actors)) {
    (data.actors as Record<string, unknown>[]).forEach((a) => {
      if (typeof a.role === 'string') {
        a.role = normalizeEnum(
          a.role, ACTOR_ROLE_ALIASES,
          ['admin', 'manager', 'user', 'guest', 'system', 'custom'],
          'custom'
        );
      }
    });
  }

  // Normalize entities — the main fix for relationship type errors
  if (Array.isArray(data.entities)) {
    (data.entities as Record<string, unknown>[]).forEach((e) => {
      if (Array.isArray(e.relationships)) {
        (e.relationships as Record<string, unknown>[]).forEach((r) => {
          if (typeof r.type === 'string') {
            r.type = normalizeEnum(
              r.type, RELATIONSHIP_TYPE_ALIASES,
              ['one_to_one', 'one_to_many', 'many_to_many'],
              'one_to_many'
            );
          }
        });
      }
      if (Array.isArray(e.attributes)) {
        (e.attributes as Record<string, unknown>[]).forEach((a) => {
          if (typeof a.type === 'string') {
            const validTypes = ['string', 'number', 'boolean', 'date', 'datetime', 'email', 'phone', 'url', 'enum', 'json', 'text', 'currency', 'file'];
            if (!validTypes.includes(a.type.toLowerCase())) {
              a.type = 'string'; // safe fallback
            } else {
              a.type = a.type.toLowerCase();
            }
          }
        });
      }
    });
  }

  // Normalize constraints
  if (Array.isArray(data.constraints)) {
    (data.constraints as Record<string, unknown>[]).forEach((c) => {
      if (typeof c.type === 'string') {
        const valid = ['business_rule', 'technical', 'security', 'compliance', 'performance'];
        if (!valid.includes(c.type)) c.type = 'business_rule';
      }
      if (typeof c.severity === 'string') {
        const valid = ['blocking', 'warning', 'info'];
        if (!valid.includes(c.severity)) c.severity = 'warning';
      }
    });
  }

  // Normalize integrations
  if (Array.isArray(data.integrations)) {
    (data.integrations as Record<string, unknown>[]).forEach((i) => {
      if (typeof i.type === 'string') {
        const valid = ['payment', 'email', 'storage', 'analytics', 'auth', 'messaging', 'ai', 'other'];
        if (!valid.includes(i.type)) i.type = 'other';
      }
    });
  }

  // Normalize assumptions
  if (Array.isArray(data.assumptions)) {
    (data.assumptions as Record<string, unknown>[]).forEach((a) => {
      if (typeof a.confidence === 'string') {
        const valid = ['high', 'medium', 'low'];
        if (!valid.includes(a.confidence)) a.confidence = 'medium';
      }
    });
  }

  // Normalize complexity
  if (typeof data.complexity === 'string') {
    const valid = ['simple', 'moderate', 'complex', 'enterprise'];
    if (!valid.includes(data.complexity)) data.complexity = 'moderate';
  }

  return data as unknown as Intent;
}

// ============================================================
// Schema Description for LLM
// ============================================================

const INTENT_SCHEMA_DESCRIPTION = `
{
  "productType": "string — Normalized product category (e.g., CRM, LMS, E-commerce, SaaS, Marketplace, Project Management, Social Platform)",
  "productName": "string — A concise, marketable product name",
  "features": [{
    "id": "string — Unique ID like 'feat-001'",
    "name": "string — Feature name in PascalCase",
    "description": "string — Clear description of what this feature does",
    "priority": "'critical' | 'high' | 'medium' | 'low'",
    "category": "'authentication' | 'authorization' | 'data_management' | 'reporting' | 'billing' | 'messaging' | 'search' | 'file_management' | 'workflow' | 'integration' | 'ui' | 'other'",
    "dependencies": ["string — IDs of features this depends on"]
  }],
  "actors": [{
    "id": "string — Unique ID like 'actor-001'",
    "name": "string — Human-readable actor name (e.g., 'Admin User')",
    "description": "string — Who this actor is and their responsibilities",
    "role": "'admin' | 'manager' | 'user' | 'guest' | 'system' | 'custom'",
    "permissions": ["string — List of permission identifiers"]
  }],
  "entities": [{
    "id": "string — Unique ID like 'entity-001'",
    "name": "string — PascalCase entity name (e.g., 'User', 'Order')",
    "description": "string — What this entity represents in the domain",
    "attributes": [{
      "name": "string — camelCase attribute name",
      "type": "'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'email' | 'phone' | 'url' | 'enum' | 'json' | 'text' | 'currency' | 'file'",
      "required": "boolean — Whether this attribute must have a value",
      "description": "string — What this attribute stores"
    }],
    "relationships": [{
      "target": "string — Name of the related entity",
      "type": "'one_to_one' | 'one_to_many' | 'many_to_many'",
      "description": "string — Nature of the relationship"
    }]
  }],
  "constraints": [{
    "id": "string — Unique ID like 'constraint-001'",
    "type": "'business_rule' | 'technical' | 'security' | 'compliance' | 'performance'",
    "description": "string — Detailed constraint description",
    "severity": "'blocking' | 'warning' | 'info'"
  }],
  "integrations": [{
    "name": "string — Integration name (e.g., 'Stripe', 'SendGrid')",
    "purpose": "string — What this integration does",
    "type": "'payment' | 'email' | 'storage' | 'analytics' | 'auth' | 'messaging' | 'ai' | 'other'",
    "required": "boolean — Whether the product cannot function without this"
  }],
  "assumptions": [{
    "id": "string — Unique ID like 'assumption-001'",
    "description": "string — The assumption being made about the user's intent",
    "confidence": "'high' | 'medium' | 'low'",
    "rationale": "string — Why this assumption is reasonable"
  }],
  "summary": "string — 2-3 sentence high-level product summary",
  "complexity": "'simple' | 'moderate' | 'complex' | 'enterprise'"
}`;

// ============================================================
// Prompt Builder
// ============================================================

function buildIntentExtractionPrompt(userPrompt: string): string {
  return `You are an expert product analyst and system architect. Your job is to analyze a natural language product description and convert it into a rigorous, structured intent specification.

## USER'S PRODUCT DESCRIPTION:
"""
${userPrompt}
"""

## YOUR TASKS:

### 1. Normalize the Product Type
Identify the canonical product category. Examples:
- "Build a CRM" → "CRM"
- "I want an online store" → "E-commerce"
- "A platform for managing projects" → "Project Management"
- "Social media app for dog owners" → "Social Platform"
If it doesn't fit a known category, use the most descriptive short phrase.

### 2. Generate a Product Name
Create a concise, professional product name (2-3 words). Do not use generic names like "My App".

### 3. Extract All Features
Break down every feature the user described — and features that are obviously implied but not stated.
- Assign a unique sequential ID: feat-001, feat-002, etc.
- Categorize each feature accurately.
- Mark dependencies between features (e.g., "user profile editing" depends on "user authentication").
- Be exhaustive: a CRM must have contacts, deals, pipeline, reports. An e-commerce app must have products, cart, checkout, orders.
- Prioritize: only mark 'critical' for features without which the product cannot function at all.

### 4. Identify All Actors
List every user role, system role, or external actor:
- Include implied roles (e.g., any product with users needs an 'admin' actor).
- Assign a unique sequential ID: actor-001, actor-002, etc.
- List specific permissions each role needs.

### 5. Model All Entities
Design a complete domain model with entities and their attributes:
- Assign a unique sequential ID: entity-001, entity-002, etc.
- Include ALL standard fields (id, timestamps, status fields) as appropriate.
- Define relationships between entities explicitly.
- Attribute types must be chosen carefully from the allowed enum.
- IMPORTANT: For relationship "type" field, you MUST use EXACTLY one of these three values:
  - "one_to_one" (e.g., User ↔ Profile)
  - "one_to_many" (e.g., User → Orders)
  - "many_to_many" (e.g., Tags ↔ Posts)
  Do NOT use has_one, has_many, belongs_to, OneToOne, etc. Use ONLY the snake_case values above.

### 6. Document Constraints
Capture any explicit or implicit constraints:
- Security requirements (data encryption, GDPR, etc.)
- Performance requirements
- Business rules
- Technical limitations
Assign a unique sequential ID: constraint-001, constraint-002, etc.

### 7. Identify Integrations
List all third-party services the product would need:
- Payment processing (Stripe, PayPal)
- Email (SendGrid, Mailgun)
- File storage (S3, Cloudinary)
- Authentication (Auth0, Clerk)
- Analytics (Mixpanel, PostHog)
- AI services (OpenAI, etc.)
Mark whether each is required or optional.

### 8. Make Explicit Assumptions
For anything vague, ambiguous, or unstated in the user's prompt, create an assumption:
- Assign a unique sequential ID: assumption-001, assumption-002, etc.
- Rate your confidence in each assumption.
- Explain your rationale.

### 9. Assess Complexity
- simple: Single-purpose tool, <5 entities, <10 features
- moderate: Standard SaaS app, 5-10 entities, 10-20 features
- complex: Multi-service architecture, 10+ entities, 20+ features, integrations
- enterprise: Multi-tenant, RBAC, billing, workflows, audit trails, compliance

## CRITICAL RULES:
- Generate at least 5 features, 2 actors, and 3 entities — even for simple requests.
- Every ID must be unique and follow the pattern: {type}-{sequence} (e.g., feat-001, actor-002, entity-003).
- Do NOT skip any section. Every array must have at least one entry.
- Be SPECIFIC in descriptions — not "manage items" but "create, read, update, and delete items with full CRUD operations".
- The product must feel complete and production-ready, not a skeleton.`;
}

// ============================================================
// Stage Execution
// ============================================================

/**
 * Stage 1: Extract structured Intent from a natural language prompt.
 *
 * This is the entry point of the compilation pipeline. It converts
 * freeform text into a typed, validated Intent object that all
 * subsequent stages depend on.
 */
export async function extractIntent(
  prompt: string
): Promise<{ intent: Intent; stageResult: StageResult }> {
  const startTime = Date.now();

  // Seed the stage result with running status
  const stageResult: StageResult = {
    stage: 1,
    name: 'Intent Extraction',
    status: 'running',
    output: undefined,
    errors: [],
    warnings: [],
    latencyMs: 0,
    tokenUsage: 0,
    retries: 0,
  };

  try {
    const extractionPrompt = buildIntentExtractionPrompt(prompt);

    const response = await structuredGenerate<Intent>(extractionPrompt, INTENT_SCHEMA_DESCRIPTION, {
      temperature: 0,
      maxTokens: 8192,
      maxRetries: 3,
    });

    // Normalize LLM output before validation (fixes common enum mismatches)
    const normalized = normalizeIntent(response.content);

    // Validate the normalized output against the Zod schema
    const validationResult = IntentSchema.safeParse(normalized);

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
        `Intent validation failed: ${errorMessages.join('; ')}`
      );
    }

    const intent = validationResult.data;

    // Post-validation checks: ensure minimum viable content
    const warnings: string[] = [];
    if (intent.features.length < 3) {
      warnings.push('Intent has fewer than 3 features — the product scope may be too narrow.');
    }
    if (intent.entities.length < 2) {
      warnings.push('Intent has fewer than 2 entities — the domain model may be incomplete.');
    }
    if (intent.actors.length < 1) {
      warnings.push('Intent has no actors — at least one user role should be defined.');
    }
    if (intent.assumptions.length === 0) {
      warnings.push('No assumptions were made — consider documenting implicit decisions.');
    }

    stageResult.status = 'success';
    stageResult.output = intent;
    stageResult.warnings = warnings;
    stageResult.latencyMs = Date.now() - startTime;
    stageResult.tokenUsage = response.usage.totalTokens;
    stageResult.retries = response.retries;

    return { intent, stageResult };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during intent extraction';

    // Only update status if not already set (validation may have set it to 'failed')
    if (stageResult.status === 'running') {
      stageResult.status = 'failed';
    }
    stageResult.errors.push(errorMessage);
    stageResult.latencyMs = Date.now() - startTime;

    console.error(`[Stage 1] Intent extraction failed: ${errorMessage}`);

    // Return a minimal fallback intent to allow pipeline to report errors downstream
    const fallbackIntent: Intent = {
      productType: 'Unknown',
      productName: 'Unnamed Product',
      features: [],
      actors: [],
      entities: [],
      constraints: [],
      integrations: [],
      assumptions: [{
        id: 'assumption-001',
        description: 'Fallback: original intent extraction failed',
        confidence: 'low',
        rationale: errorMessage,
      }],
      summary: `Intent extraction failed. Original prompt: ${prompt.substring(0, 200)}`,
      complexity: 'simple',
    };

    return { intent: fallbackIntent, stageResult };
  }
}
