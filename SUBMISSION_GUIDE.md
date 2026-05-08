# Submission Guide - AI Platform Engineer Demo Task

Use this as your final handoff script.

## 1) Live Demo URL

Host this project (Vercel recommended) and share:

- Main UI page where prompt input is visible
- JSON output views for all generated schemas
- Pipeline stage status timeline

## 2) Repository Structure to Highlight

Show these modules during review:

- Compiler pipeline orchestrator: src/lib/pipeline/orchestrator.ts
- Deterministic generation wrapper: src/lib/pipeline/llm.ts
- Strict schema contracts: src/lib/pipeline/types.ts
- Cross-layer validator: src/lib/pipeline/validator.ts
- Targeted repair engine: src/lib/pipeline/repair.ts
- Runtime simulation: src/lib/pipeline/runtime.ts
- Benchmarks and metrics: src/lib/evaluation/datasets.ts, src/lib/evaluation/metrics.ts

## 3) Loom Video Outline (5-10 min)

1. Problem framing (compiler, not prompt script)
2. End-to-end architecture and data flow
3. Stage-by-stage pipeline walk-through
4. Validation and targeted repair mechanics
5. Determinism controls (temperature, schema contracts)
6. Execution awareness (runtime simulation checks)
7. Failure handling strategy (ambiguous/conflicting prompts)
8. Benchmark metrics and cost-quality tradeoffs
9. Live run of one fresh prompt

## 4) Evaluation Evidence to Include

Current benchmark outcome:

- Prompt set: 20 (10 real_product + 10 edge_case)
- Successful runs: 20
- Execution success rate: 1
- Average latency: 1084.75 ms

How to reproduce:

```powershell
$body = @{ runAll = $true } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/benchmark' -Method Post -ContentType 'application/json' -Body $body
```

## 5) Exact Requirement Mapping

- Multi-stage pipeline: implemented in orchestrator with 6 stages
- Strict schema enforcement: Zod validation at stage boundaries
- Validation + repair: validator + repair engine with targeted fixes
- Determinism: structured generation defaults and typed parsing
- Execution awareness: runtime simulation stage
- Failure handling: staged fallbacks and assumptions
- Evaluation framework: benchmark datasets + metrics tracker
- Cost vs quality: two operating profiles in metrics analysis

## 6) Final Submission

Submit on the company form:

- https://forms.gle/5mApv6YNKJPak1Ry6

Attach:

- Live URL
- GitHub URL
- Loom URL

