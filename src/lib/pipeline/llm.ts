/**
 * LLM Client Wrapper
 *
 * WHY: Centralizes all LLM interactions behind a single interface.
 * This enables temperature control, retry policies, token tracking,
 * and deterministic output enforcement in one place.
 *
 * PROVIDER: Uses the OpenAI-compatible Chat Completions API.
 * Set OPENAI_API_KEY and optionally OPENAI_BASE_URL / OPENAI_MODEL in .env.
 * If OPENAI_API_KEY is not set, falls back to demo mode with pre-built responses.
 *
 * TRADEOFFS:
 * - Synchronous wrapper over async LLM calls adds minor latency
 * - Retry policy increases reliability at cost of potential delay
 * - Strict JSON mode reduces creativity but ensures parseable output
 */

import { isDemoMode, getDemoResponse } from './demo-data';

interface LLMConfig {
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  systemPrompt?: string;
}

interface LLMResponse<T = unknown> {
  content: T;
  raw: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  retries: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  temperature: 0, // Deterministic by default
  maxTokens: 8192,
  maxRetries: 3,
};

/**
 * Call the OpenAI-compatible Chat Completions endpoint.
 */
async function chatCompletion(
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your .env file. Example: OPENAI_API_KEY=sk-...',
    );
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${errBody.substring(0, 500)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No choices returned from API');

  return {
    content: choice.message?.content ?? '',
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? Math.ceil((choice.message?.content?.length ?? 0) / 4),
    },
  };
}

/**
 * Execute a structured LLM call with JSON parsing and retry logic.
 *
 * Design decisions:
 * 1. temperature=0 by default for determinism
 * 2. Retry on JSON parse failures (not on valid but undesired outputs)
 * 3. Token usage tracking for cost analysis
 * 4. Latency measurement for metrics
 */
export async function structuredGenerate<T>(
  prompt: string,
  schemaDescription: string,
  config: LLMConfig = {}
): Promise<LLMResponse<T>> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | null = null;
  let raw = '';
  let retries = 0;

  // ---- Demo Mode: return pre-built response without calling LLM ----
  if (isDemoMode()) {
    console.log('[LLM] Demo mode — returning pre-built response');
    const demoDelay = 200 + Math.random() * 300; // 200-500ms simulated latency
    await new Promise((r) => setTimeout(r, demoDelay));
    const demoRaw = getDemoResponse(prompt, schemaDescription);
    const parsed: T = JSON.parse(demoRaw);
    return {
      content: parsed,
      raw: demoRaw,
      usage: { promptTokens: 500, completionTokens: 1500, totalTokens: 2000 },
      latencyMs: Math.round(demoDelay),
      retries: 0,
    };
  }

  const systemPrompt = mergedConfig.systemPrompt || `You are a precise system engineer. You MUST respond with ONLY valid JSON. No markdown, no prose, no code fences. Just the raw JSON object.

The output must conform to this schema:
${schemaDescription}

Rules:
- Return ONLY the JSON object, nothing else
- All required fields must be present
- Use null for optional fields that don't apply
- Use consistent camelCase naming
- No trailing commas
- Properly escaped strings`;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries!; attempt++) {
    try {
      const result = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        mergedConfig.temperature!,
        mergedConfig.maxTokens!,
      );

      raw = result.content;

      // Strip markdown code fences if present
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed: T = JSON.parse(cleaned);
      const latencyMs = Date.now() - startTime;

      return {
        content: parsed,
        raw,
        usage: result.usage,
        latencyMs,
        retries: attempt,
      };
    } catch (error) {
      lastError = error as Error;
      retries = attempt + 1;
      console.error(`LLM attempt ${attempt + 1} failed:`, (error as Error).message);
    }
  }

  throw new Error(
    `LLM generation failed after ${mergedConfig.maxRetries} retries. Last error: ${lastError?.message}. Raw output: ${raw.substring(0, 500)}`
  );
}

/**
 * Simple text generation for repair and analysis stages.
 */
export async function textGenerate(
  prompt: string,
  systemPrompt: string,
  config: LLMConfig = {}
): Promise<LLMResponse<string>> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // ---- Demo Mode ----
  if (isDemoMode()) {
    console.log('[LLM] Demo mode — returning placeholder text');
    const demoDelay = 100 + Math.random() * 200;
    await new Promise((r) => setTimeout(r, demoDelay));
    return {
      content: 'Demo mode: repair analysis complete. All issues can be auto-fixed.',
      raw: 'Demo mode: repair analysis complete. All issues can be auto-fixed.',
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: Math.round(demoDelay),
      retries: 0,
    };
  }

  const result = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    mergedConfig.temperature!,
    mergedConfig.maxTokens!,
  );

  return {
    content: result.content,
    raw: result.content,
    usage: result.usage,
    latencyMs: Date.now() - startTime,
    retries: 0,
  };
}
