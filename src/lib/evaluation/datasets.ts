/**
 * Benchmark Datasets for Pipeline Evaluation
 *
 * WHY: A production compiler needs regression tests. These datasets serve as
 * the "test suite" for the LLM Application Compiler — covering both realistic
 * product prompts (to validate feature extraction quality) and adversarial
 * edge cases (to test robustness against ambiguity, contradiction, and
 * impossible constraints).
 *
 * DATASET COMPOSITION:
 * - Dataset A (10 prompts): Real-world SaaS products with specific features.
 *   These validate that the pipeline correctly identifies entities, features,
 *   actors, integrations, and complexity levels.
 * - Dataset B (10 prompts): Adversarial edge cases — vague inputs, logical
 *   contradictions, impossible constraints, and extreme complexity. These
 *   validate that the pipeline degrades gracefully and surfaces appropriate
 *   assumptions/warnings rather than hallucinating.
 *
 * TRADEOFFS:
 * - Hand-curated datasets limit coverage but provide deterministic, reproducible benchmarks.
 * - Difficulty ratings are subjective; they guide test prioritization, not pass/fail criteria.
 * - Expected entities/features are soft targets — the pipeline should find ≥60% to pass.
 */

// ============================================================
// Benchmark Prompt Type
// ============================================================

export interface BenchmarkPrompt {
  /** Unique identifier for referencing this benchmark */
  id: string;

  /** The raw user prompt that feeds into the pipeline */
  prompt: string;

  /** Whether this is a realistic product or an adversarial edge case */
  category: 'real_product' | 'edge_case';

  /** Sub-classification within the category (e.g., "CRM", "vague", "contradiction") */
  subcategory: string;

  /** Entity names we expect the pipeline to identify */
  expectedEntities?: string[];

  /** Feature types we expect the pipeline to extract */
  expectedFeatures?: string[];

  /** Relative difficulty for the pipeline to process correctly */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';

  /** Expected complexity classification from the pipeline */
  expectedComplexity?: 'simple' | 'moderate' | 'complex' | 'enterprise';
}

// ============================================================
// Dataset A: Real Product Prompts (10)
// ============================================================

const realProductPrompts: BenchmarkPrompt[] = [
  {
    id: 'bp-001',
    prompt:
      'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with Stripe payments. Admins can see analytics.',
    category: 'real_product',
    subcategory: 'CRM',
    expectedEntities: ['User', 'Contact', 'Organization', 'Deal', 'Subscription', 'Payment', 'Analytics'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'reporting',
      'billing',
      'data_management',
      'search',
      'ui',
    ],
    difficulty: 'medium',
    expectedComplexity: 'moderate',
  },
  {
    id: 'bp-002',
    prompt:
      'Create a Learning Management System (LMS) with courses, enrollments, progress tracking, quizzes with scoring, certificates, and instructor management.',
    category: 'real_product',
    subcategory: 'LMS',
    expectedEntities: ['Course', 'Enrollment', 'Lesson', 'Quiz', 'QuizQuestion', 'Certificate', 'Instructor', 'Student', 'Progress'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'workflow',
      'reporting',
      'ui',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-003',
    prompt:
      'Build an e-commerce platform with product catalog, shopping cart, checkout, order management, inventory tracking, and payment processing with Stripe.',
    category: 'real_product',
    subcategory: 'E-commerce',
    expectedEntities: ['Product', 'Category', 'Cart', 'CartItem', 'Order', 'OrderItem', 'Payment', 'Inventory', 'User', 'Address'],
    expectedFeatures: [
      'authentication',
      'data_management',
      'billing',
      'search',
      'workflow',
      'ui',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-004',
    prompt:
      'Create a SaaS analytics dashboard with multi-tenant support, custom report builder, data visualization, scheduled exports, and role-based data access.',
    category: 'real_product',
    subcategory: 'Analytics',
    expectedEntities: ['Organization', 'User', 'Report', 'Dashboard', 'Widget', 'DataSource', 'Export', 'Tenant'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'reporting',
      'data_management',
      'file_management',
      'integration',
      'ui',
    ],
    difficulty: 'expert',
    expectedComplexity: 'enterprise',
  },
  {
    id: 'bp-005',
    prompt:
      'Build a project management tool like Trello with boards, lists, cards, drag-and-drop, team collaboration, deadlines, file attachments, and activity logging.',
    category: 'real_product',
    subcategory: 'Project Management',
    expectedEntities: ['Board', 'List', 'Card', 'User', 'Team', 'Comment', 'Attachment', 'Activity', 'Label', 'DueDate'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'file_management',
      'messaging',
      'ui',
      'workflow',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-006',
    prompt:
      'Create an HR portal with employee management, leave requests, payroll tracking, performance reviews, onboarding workflows, and document management.',
    category: 'real_product',
    subcategory: 'HR Portal',
    expectedEntities: ['Employee', 'Department', 'LeaveRequest', 'Payroll', 'PerformanceReview', 'OnboardingTask', 'Document', 'User'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'file_management',
      'workflow',
      'reporting',
      'ui',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-007',
    prompt:
      'Build an AI chatbot platform with conversation management, knowledge base, analytics, multi-channel deployment, and team management for bot builders.',
    category: 'real_product',
    subcategory: 'AI Platform',
    expectedEntities: ['Bot', 'Conversation', 'Message', 'KnowledgeBase', 'Channel', 'Team', 'User', 'AnalyticsEvent'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'messaging',
      'reporting',
      'data_management',
      'integration',
      'ai',
      'ui',
    ],
    difficulty: 'expert',
    expectedComplexity: 'enterprise',
  },
  {
    id: 'bp-008',
    prompt:
      'Create a restaurant booking system with table management, reservations, menu display, order tracking, payment processing, and customer reviews.',
    category: 'real_product',
    subcategory: 'Booking System',
    expectedEntities: ['Restaurant', 'Table', 'Reservation', 'MenuItem', 'Order', 'Payment', 'Review', 'Customer', 'User'],
    expectedFeatures: [
      'authentication',
      'data_management',
      'billing',
      'search',
      'workflow',
      'ui',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-009',
    prompt:
      'Build a social media management tool with post scheduling, analytics, multi-account support, content calendar, and team collaboration.',
    category: 'real_product',
    subcategory: 'Social Media',
    expectedEntities: ['Account', 'Post', 'ScheduledPost', 'AnalyticsReport', 'TeamMember', 'ContentCalendar', 'MediaAsset', 'User'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'reporting',
      'file_management',
      'messaging',
      'integration',
      'ui',
    ],
    difficulty: 'hard',
    expectedComplexity: 'complex',
  },
  {
    id: 'bp-010',
    prompt:
      'Create a telemedicine platform with video consultations, appointment scheduling, patient records, prescriptions, and payment processing.',
    category: 'real_product',
    subcategory: 'Healthcare',
    expectedEntities: ['Patient', 'Doctor', 'Appointment', 'Consultation', 'MedicalRecord', 'Prescription', 'Payment', 'User', 'Schedule'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'billing',
      'workflow',
      'messaging',
      'ui',
    ],
    difficulty: 'expert',
    expectedComplexity: 'enterprise',
  },
];

// ============================================================
// Dataset B: Edge Cases (10)
// ============================================================

const edgeCasePrompts: BenchmarkPrompt[] = [
  {
    id: 'bp-011',
    prompt: 'Build a modern app for teams',
    category: 'edge_case',
    subcategory: 'vague',
    difficulty: 'easy',
    expectedComplexity: 'simple',
    // The pipeline should surface assumptions about what "modern app" and "teams" mean.
    // Minimal entities expected — mainly User and Team.
  },
  {
    id: 'bp-012',
    prompt: 'Create an app with no authentication but admin-only analytics dashboard',
    category: 'edge_case',
    subcategory: 'contradiction',
    difficulty: 'medium',
    expectedComplexity: 'simple',
    // Contradiction: no auth means no admin role. Pipeline should flag this.
  },
  {
    id: 'bp-013',
    prompt: 'Add payments',
    category: 'edge_case',
    subcategory: 'extremely_vague',
    difficulty: 'easy',
    // Nearly zero context. Pipeline should surface broad assumptions.
  },
  {
    id: 'bp-014',
    prompt:
      'Build a blockchain-powered AI social network with quantum-resistant encryption and real-time holographic video calls',
    category: 'edge_case',
    subcategory: 'impossible_constraints',
    difficulty: 'hard',
    // Several features are not achievable with standard web stacks.
    // Pipeline should flag constraints as blocking or warning severity.
  },
  {
    id: 'bp-015',
    prompt: 'Create a to-do app',
    category: 'edge_case',
    subcategory: 'minimal',
    difficulty: 'easy',
    expectedComplexity: 'simple',
    expectedEntities: ['User', 'Todo'],
    expectedFeatures: ['data_management', 'ui'],
  },
  {
    id: 'bp-016',
    prompt:
      'Build an inventory system where guests can delete products but admins can only view them',
    category: 'edge_case',
    subcategory: 'conflicting_permissions',
    difficulty: 'medium',
    expectedComplexity: 'moderate',
    expectedEntities: ['Product', 'Category', 'User', 'Inventory'],
    // Contradiction in permission model. Pipeline should flag the illogical RBAC.
  },
  {
    id: 'bp-017',
    prompt:
      'Create a system with 50 different user roles each with unique permissions across 200 entities',
    category: 'edge_case',
    subcategory: 'extreme_complexity',
    difficulty: 'expert',
    expectedComplexity: 'enterprise',
    // Extreme scale. Pipeline should succeed but may simplify or chunk the output.
  },
  {
    id: 'bp-018',
    prompt:
      'Build a blog with no database, no authentication, no users, but with collaborative editing and real-time updates',
    category: 'edge_case',
    subcategory: 'contradiction',
    difficulty: 'medium',
    expectedComplexity: 'simple',
    // Collaborative editing and real-time updates require users and state persistence.
    // Pipeline should flag the contradiction between "no database" and "real-time updates".
  },
  {
    id: 'bp-019',
    prompt:
      'Create a fintech app for stock trading with real-time data, portfolio management, tax reporting, regulatory compliance, and audit logging',
    category: 'edge_case',
    subcategory: 'compliance_heavy',
    difficulty: 'hard',
    expectedComplexity: 'enterprise',
    expectedEntities: ['User', 'Portfolio', 'Stock', 'Trade', 'Transaction', 'TaxReport', 'AuditLog'],
    expectedFeatures: [
      'authentication',
      'authorization',
      'data_management',
      'reporting',
      'workflow',
      'integration',
    ],
  },
  {
    id: 'bp-020',
    prompt:
      'Build a mobile app that works offline, syncs online, has push notifications, uses biometric auth, and supports 30 languages',
    category: 'edge_case',
    subcategory: 'multi_constraint',
    difficulty: 'hard',
    expectedComplexity: 'complex',
    expectedEntities: ['User', 'Device', 'SyncRecord', 'Notification', 'Language'],
    expectedFeatures: ['authentication', 'data_management', 'messaging', 'ui'],
    // Multiple non-trivial constraints: offline-first, i18n, biometric, push.
    // Pipeline should identify all constraints and flag mobile-specific limitations.
  },
];

// ============================================================
// Combined Dataset
// ============================================================

/**
 * All benchmark prompts, ordered: Dataset A (real products) first, then Dataset B (edge cases).
 *
 * Usage:
 *   import { benchmarkPrompts } from '@/lib/evaluation/datasets';
 *   const realProducts = benchmarkPrompts.filter(p => p.category === 'real_product');
 *   const edgeCases = benchmarkPrompts.filter(p => p.category === 'edge_case');
 *   const hardPrompts = benchmarkPrompts.filter(p => p.difficulty === 'hard' || p.difficulty === 'expert');
 */
export const benchmarkPrompts: BenchmarkPrompt[] = [
  ...realProductPrompts,
  ...edgeCasePrompts,
];

// ============================================================
// Dataset Statistics (for display / reporting)
// ============================================================

export const datasetStats = {
  total: benchmarkPrompts.length,
  byCategory: {
    real_product: benchmarkPrompts.filter((p) => p.category === 'real_product').length,
    edge_case: benchmarkPrompts.filter((p) => p.category === 'edge_case').length,
  },
  byDifficulty: {
    easy: benchmarkPrompts.filter((p) => p.difficulty === 'easy').length,
    medium: benchmarkPrompts.filter((p) => p.difficulty === 'medium').length,
    hard: benchmarkPrompts.filter((p) => p.difficulty === 'hard').length,
    expert: benchmarkPrompts.filter((p) => p.difficulty === 'expert').length,
  },
  subcategories: [...new Set(benchmarkPrompts.map((p) => p.subcategory))],
} as const;
