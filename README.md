# AppForge - LLM Application Compiler

This project implements a compiler-style system that transforms natural language product prompts into executable application configuration.

Pipeline flow:

1. Intent Extraction
2. Architecture Planning
3. Schema Generation
4. Cross-Layer Validation
5. Repair and Regeneration
6. Runtime Simulation

## Why this fits the assignment

- Multi-stage pipeline with clear stage boundaries and typed interfaces
- Strict schema enforcement via Zod contracts
- Deterministic generation defaults (temperature 0)
- Validation + targeted repair engine (not blind full retries)
- Execution awareness via runtime simulation checks
- Failure handling with fallback assumptions in demo mode
- Evaluation framework with 20 prompts (10 real product + 10 edge case)
- Cost vs quality analysis in metrics tracker

## Quick start

Prerequisites:

- Node.js 20+

Install and run:

```bash
npm install
npm run dev
```

Open:

- http://localhost:3000

## API surface

- POST /api/compile starts async pipeline run and returns jobId
- GET /api/compile/[id] returns job status/result
- POST /api/pipeline runs validate/repair/simulate actions on schema bundles
- POST /api/benchmark runs benchmark datasets and computes metrics
- GET /api/metrics returns aggregated metrics

## Assignment evidence (local benchmark run)

Run command:

```powershell
$body = @{ runAll = $true } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/benchmark' -Method Post -ContentType 'application/json' -Body $body
```

Observed results on May 8, 2026:

- totalPrompts: 20
- successfulRuns: 20
- totalRuns: 20
- partialRuns: 0
- failedRuns: 0
- executionSuccessRate: 1
- avgLatencyMs: 1084.75
- avgValidationErrors: 0
- avgRepairActions: 0

## Architecture map

Core pipeline modules:

- src/lib/pipeline/intent.ts
- src/lib/pipeline/architecture.ts
- src/lib/pipeline/schema-gen.ts
- src/lib/pipeline/validator.ts
- src/lib/pipeline/repair.ts
- src/lib/pipeline/runtime.ts
- src/lib/pipeline/orchestrator.ts

Evaluation modules:

- src/lib/evaluation/datasets.ts
- src/lib/evaluation/metrics.ts

UI and API:

- src/app/page.tsx
- src/app/api/compile/route.ts
- src/app/api/compile/[id]/route.ts
- src/app/api/benchmark/route.ts
- src/app/api/pipeline/route.ts
- src/app/api/metrics/route.ts

## Submission package checklist

- Live URL from hosted deployment (recommended)
- GitHub repository link
- Loom video (5-10 minutes) explaining design and tradeoffs
- Google form submission: https://forms.gle/5mApv6YNKJPak1Ry6

