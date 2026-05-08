import { NextRequest, NextResponse } from 'next/server';
import { validateSchemas } from '@/lib/pipeline/validator';
import { repairSchemas } from '@/lib/pipeline/repair';
import { simulateRuntime } from '@/lib/pipeline/runtime';
import type {
  UISchema,
  APISchema,
  DBSchema,
  AuthSchema,
  BusinessLogicSchema,
} from '@/lib/pipeline/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schemas, action } = body as {
      schemas: {
        uiSchema: UISchema;
        apiSchema: APISchema;
        dbSchema: DBSchema;
        authSchema: AuthSchema;
        businessLogic: BusinessLogicSchema;
      };
      action: 'validate' | 'repair' | 'simulate' | 'full';
    };

    if (!schemas) {
      return NextResponse.json(
        { error: 'Missing schemas in request body' },
        { status: 400 }
      );
    }

    const results: Record<string, unknown> = {};

    switch (action) {
      case 'validate': {
        const validation = validateSchemas(schemas);
        results.validation = validation;
        break;
      }

      case 'repair': {
        const validation = validateSchemas(schemas);
        results.validation = validation;
        if (validation.issues.length > 0) {
          const repair = await repairSchemas(schemas, validation.issues);
          results.repair = repair;
          // Re-validate after repair
          const postRepair = validateSchemas(repair.schemas);
          results.postRepairValidation = postRepair;
        }
        break;
      }

      case 'simulate': {
        const simulation = simulateRuntime(schemas);
        results.simulation = simulation;
        break;
      }

      case 'full': {
        // Full pipeline: validate → repair → simulate
        const validation = validateSchemas(schemas);
        results.validation = validation;

        if (validation.issues.length > 0) {
          const repair = await repairSchemas(schemas, validation.issues);
          results.repair = repair;

          // Simulate with repaired schemas
          const simulation = simulateRuntime(repair.schemas);
          results.simulation = simulation;

          // Post-repair validation
          const postRepair = validateSchemas(repair.schemas);
          results.postRepairValidation = postRepair;
        } else {
          const simulation = simulateRuntime(schemas);
          results.simulation = simulation;
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use validate, repair, simulate, or full.` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('Pipeline API error:', error);
    return NextResponse.json(
      { error: `Pipeline execution failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
