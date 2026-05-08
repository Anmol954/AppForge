'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Zap,
  Shield,
  Code,
  Database,
  Layers,
  ArrowRight,
  Clock,
  Coins,
  BarChart3,
  Activity,
  Settings,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Terminal,
  FileJson,
  Wrench,
  Cpu,
  Bolt,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { PipelineResult, BenchmarkResult } from '@/lib/pipeline/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CostProfile {
  estimatedCostPerRequest: number;
  avgLatencyMs: number;
  qualityScore: number;
  tradeoffs: string[];
}

interface CostAnalysis {
  lowCostMode: CostProfile;
  highReliabilityMode: CostProfile;
}

interface BenchmarkResponse {
  results: BenchmarkResult[];
  errors: { prompt: string; error: string }[];
  totalPrompts: number;
  successfulRuns: number;
  metrics: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_NAMES = [
  'Intent Extraction',
  'Architecture Planning',
  'Schema Generation',
  'Cross-Layer Validation',
  'Repair Engine',
  'Runtime Simulation',
];

const STAGE_ICONS = [
  Sparkles,
  Layers,
  Code,
  Shield,
  Wrench,
  Cpu,
];

const DEFAULT_PROMPT =
  'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with Stripe payments. Admins can see analytics.';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function JsonView({ data, label }: { data: unknown; label?: string }) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <div className="rounded-lg overflow-hidden border border-zinc-800">
      {label && (
        <div className="bg-zinc-800/80 px-4 py-2 border-b border-zinc-700 flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-zinc-300">{label}</span>
        </div>
      )}
      <SyntaxHighlighter
        language="json"
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'rgb(24 24 27)',
          fontSize: '0.75rem',
          lineHeight: '1.5',
        }}
        showLineNumbers
        lineNumberStyle={{ color: '#52525b', minWidth: '2.5em' }}
      >
        {json}
      </SyntaxHighlighter>
    </div>
  );
}

function PipelineStageBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'PENDING',
      className: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    },
    running: {
      label: 'RUNNING',
      className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse',
    },
    success: {
      label: 'SUCCESS',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    },
    failed: {
      label: 'FAILED',
      className: 'bg-red-500/10 text-red-400 border-red-500/30',
    },
    repaired: {
      label: 'REPAIRED',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    },
  };
  const c = config[status] ?? { label: status.toUpperCase(), className: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
  return (
    <Badge variant="outline" className={`text-[10px] font-bold tracking-wider ${c.className}`}>
      {status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {c.label}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { className: string }> = {
    error: { className: 'bg-red-500/10 text-red-400 border-red-500/30' },
    warning: { className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    info: { className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  };
  const c = config[severity] ?? config.info;
  return (
    <Badge variant="outline" className={`text-[10px] font-bold tracking-wider ${c.className}`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
    case 'failed':
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
    case 'repaired':
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-cyan-400 shrink-0 animate-spin" />;
    default:
      return <div className="h-4 w-4 rounded-full bg-zinc-700 shrink-0" />;
  }
}

function LayerBadge({ layer }: { layer: string }) {
  const colors: Record<string, string> = {
    ui: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    api: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    db: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    auth: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    business_logic: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    cross_layer: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colors[layer] ?? 'bg-zinc-800 text-zinc-400'}`}>
      {layer}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'zinc',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    cyan: 'text-cyan-400',
    teal: 'text-teal-400',
    zinc: 'text-zinc-100',
  };
  const bgMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10',
    red: 'bg-red-500/10',
    amber: 'bg-amber-500/10',
    cyan: 'bg-cyan-500/10',
    teal: 'bg-teal-500/10',
    zinc: 'bg-zinc-800',
  };
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${colorMap[color] ?? colorMap.zinc}`}>{value}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${bgMap[color] ?? bgMap.zinc}`}>
            <Icon className={`h-5 w-5 ${colorMap[color] ?? colorMap.zinc}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function Home() {
  // State
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSchemaTab, setActiveSchemaTab] = useState('ui');
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkResponse | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skipRepair, setSkipRepair] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [maxRepairCycles, setMaxRepairCycles] = useState('3');
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis | null>(null);
  const [currentRunningStage, setCurrentRunningStage] = useState<number>(-1);

  // Fetch cost analysis on mount
  useEffect(() => {
    fetch('/api/metrics')
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          console.error(`[metrics] API error ${res.status}:`, text.substring(0, 200));
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.costAnalysis) setCostAnalysis(data.costAnalysis);
      })
      .catch(() => {});
  }, [pipelineResult, benchmarkData]);

  // Compile handler — async polling pattern to avoid ALB timeout (502)
  const handleCompile = useCallback(async () => {
    if (!prompt.trim() || isCompiling) return;
    setIsCompiling(true);
    setPipelineResult(null);
    setActiveTab('overview');
    setCurrentRunningStage(0);

    // Simulate pipeline stages progression
    const stageInterval = setInterval(() => {
      setCurrentRunningStage((prev) => {
        if (prev >= 5) {
          clearInterval(stageInterval);
          return -1;
        }
        return prev + 1;
      });
    }, 800);

    try {
      // Step 1: Submit job (returns immediately)
      const submitRes = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          options: {
            skipRepair,
            skipValidation,
            maxRepairCycles: parseInt(maxRepairCycles, 10) || 3,
          },
        }),
      });
      if (!submitRes.ok) {
        const text = await submitRes.text();
        console.error(`[compile] Submit error ${submitRes.status}:`, text.substring(0, 200));
        return;
      }
      const { jobId } = await submitRes.json();
      if (!jobId) {
        console.error('[compile] No job ID returned');
        return;
      }

      // Step 2: Poll for results every 2 seconds
      const pollInterval = setInterval(() => {
        setCurrentRunningStage((prev) => {
          if (prev >= 5) return 5;
          return prev + 1;
        });
      }, 4000);

      const maxPolls = 120; // 120 * 2s = 4 minutes max
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 2000));

        const statusRes = await fetch(`/api/compile/${jobId}`);
        if (!statusRes.ok) continue;
        const status = await statusRes.json();

        if (status.status === 'completed' && status.result) {
          clearInterval(pollInterval);
          setPipelineResult(status.result);
          setCurrentRunningStage(-1);
          setIsCompiling(false);
          return;
        }

        if (status.status === 'failed') {
          clearInterval(pollInterval);
          console.error('[compile] Job failed:', status.error);
          setIsCompiling(false);
          return;
        }
        // status === 'pending' | 'running' → keep polling
      }

      // Timeout: polling exceeded max attempts
      clearInterval(pollInterval);
      console.error('[compile] Polling timed out after 4 minutes');
    } catch (err) {
      console.error('Compile failed:', err);
    } finally {
      clearInterval(stageInterval);
      setCurrentRunningStage(-1);
      setIsCompiling(false);
    }
  }, [prompt, isCompiling, skipRepair, skipValidation, maxRepairCycles]);

  // Benchmark handler
  const handleBenchmark = useCallback(async () => {
    if (isBenchmarking) return;
    setIsBenchmarking(true);
    setBenchmarkData(null);
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAll: true }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[benchmark] API error ${res.status}:`, text.substring(0, 200));
        return;
      }
      const data = await res.json();
      setBenchmarkData(data);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsBenchmarking(false);
    }
  }, [isBenchmarking]);

  // Derived data
  const stages = pipelineResult?.stages ?? [];
  const totalLatency = pipelineResult?.totalLatencyMs ?? 0;
  const totalTokens = pipelineResult?.totalTokens ?? 0;
  const issues = pipelineResult?.validationIssues ?? [];
  const repairs = pipelineResult?.repairActions ?? [];
  const finalStatus = pipelineResult?.finalStatus ?? '';

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;
  const repairedCount = repairs.filter((a) => a.success).length;

  const chartData = stages.map((s) => ({
    name: s.name.length > 18 ? s.name.substring(0, 16) + '...' : s.name,
    latency: s.latencyMs,
    tokens: s.tokenUsage,
  }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* ===== HERO HEADER ===== */}
      <header className="relative overflow-hidden bg-gradient-to-b from-slate-900/80 to-slate-950/50 border-b border-emerald-500/10 backdrop-blur-sm">
        {/* Animated gradient background */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-0 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl" style={{ animationDelay: '0.5s' }} />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4 flex-1">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 flex items-center justify-center shadow-xl shadow-emerald-500/30 flex-shrink-0">
                  <Zap className="h-8 w-8 text-slate-950 font-bold" />
                </div>
                <div className="flex-1">
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                    AppForge
                  </h1>
                  <p className="text-sm text-emerald-300/80 font-semibold mt-1">LLM Application Compiler</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                <Badge className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold px-3 py-1">
                  <Sparkles className="h-3 w-3 mr-1.5" /> v2.0
                </Badge>
                <Badge className="bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs font-semibold px-3 py-1">
                  <Bolt className="h-3 w-3 mr-1.5" /> 6 Stages
                </Badge>
              </div>
            </div>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
              Transform natural language product descriptions into <span className="font-semibold text-emerald-300">production-ready</span> application schemas. Our deterministic 6-stage compiler pipeline ensures consistent, validated output.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ===== INPUT PANEL ===== */}
        <Card className="relative bg-gradient-to-br from-slate-800/40 to-slate-900/60 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10 overflow-hidden">
          {/* Gradient line at top */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" />
          
          <CardHeader className="pb-6 bg-gradient-to-r from-slate-800/30 to-transparent">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-3 text-2xl font-bold">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  Describe Your Application
                </CardTitle>
                <CardDescription className="text-slate-400 mt-2">
                  Enter a natural language description and let our AI compiler generate production-ready schemas
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="relative">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Build a SaaS CRM with user authentication, contact management, dashboard with analytics, role-based access control, and Stripe subscription billing..."
                className="min-h-[140px] bg-slate-950/60 border border-slate-700/50 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 resize-y font-mono text-sm rounded-lg backdrop-blur-sm"
              />
              <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                {prompt.length} characters
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                onClick={handleCompile}
                disabled={isCompiling || !prompt.trim()}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold shadow-lg shadow-emerald-500/30 gap-2 px-8 py-6 sm:py-2 text-base sm:text-sm transition-all duration-200 hover:shadow-emerald-500/50 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isCompiling ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Compiling...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    Compile Now
                  </>
                )}
              </Button>

              {/* Advanced Options Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="border-slate-700/60 text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 backdrop-blur-sm gap-2"
              >
                <Settings className="h-4 w-4" />
                Advanced Options
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>

                <div className="hidden sm:block flex-1" />
              </div>

            {/* Advanced Options */}
            {showAdvanced && (
                <div className="mt-3 p-4 bg-slate-950/50 rounded-lg border border-slate-700/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-slate-300">Skip Repair</p>
                        <p className="text-xs text-slate-500">Disable auto-repair stage</p>
                    </div>
                    <Switch checked={skipRepair} onCheckedChange={setSkipRepair} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-slate-300">Skip Validation</p>
                        <p className="text-xs text-slate-500">Disable cross-layer validation</p>
                    </div>
                    <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
                  </div>
                  <div className="space-y-1.5">
                      <p className="text-sm font-medium text-slate-300">Max Repair Cycles</p>
                    <Select value={maxRepairCycles} onValueChange={setMaxRepairCycles}>
                        <SelectTrigger className="bg-slate-950/50 border-slate-700/30 text-slate-200 h-9">
                        <SelectValue />
                      </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3 (Default)</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== PIPELINE STAGE VISUALIZATION ===== */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-emerald-400" />
              Pipeline Stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-stretch gap-2 lg:gap-0 overflow-x-auto pb-2">
              {STAGE_NAMES.map((name, i) => {
                const stage = stages[i];
                const isRunning = isCompiling && currentRunningStage === i;
                const isDone = stage && (stage.status === 'success' || stage.status === 'repaired');
                const isPending = !stage && !isRunning;
                const status = isRunning ? 'running' : stage?.status ?? 'pending';
                const Icon = STAGE_ICONS[i];

                return (
                  <div key={i} className="flex items-center gap-2 flex-shrink-0">
                    <div
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-500 min-w-[140px] ${
                        status === 'success'
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : status === 'repaired'
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : status === 'failed'
                              ? 'bg-red-500/5 border-red-500/30'
                              : status === 'running'
                                ? 'bg-cyan-500/5 border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                                : 'bg-zinc-950 border-zinc-800'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          status === 'success'
                            ? 'bg-emerald-500/20'
                            : status === 'repaired'
                              ? 'bg-amber-500/20'
                              : status === 'failed'
                                ? 'bg-red-500/20'
                                : status === 'running'
                                  ? 'bg-cyan-500/20'
                                  : 'bg-zinc-800'
                        }`}
                      >
                        {status === 'running' ? (
                          <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
                        ) : isDone || status === 'failed' || status === 'repaired' ? (
                          <StatusIcon status={status} />
                        ) : (
                          <Icon className="h-5 w-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-zinc-300 mb-1">{name}</p>
                        <PipelineStageBadge status={status} />
                        {(stage || isRunning) && (
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500">
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {isRunning ? '...' : `${stage.latencyMs}ms`}
                            </span>
                            {!isRunning && stage && (
                              <span className="flex items-center gap-0.5">
                                <Zap className="h-2.5 w-2.5" />
                                {stage.tokenUsage}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {i < 5 && (
                      <div className="flex items-center px-1 lg:px-2">
                        <ArrowRight
                          className={`h-4 w-4 transition-colors duration-300 ${
                            isDone || (isCompiling && currentRunningStage > i)
                              ? 'text-emerald-500/50'
                              : 'text-zinc-700'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ===== LOADING STATE ===== */}
        {isCompiling && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Skeleton className="h-8 w-48 bg-zinc-800" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl bg-zinc-900" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl bg-zinc-900" />
          </div>
        )}

        {/* ===== RESULTS DASHBOARD ===== */}
        {pipelineResult && !isCompiling && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="bg-zinc-900 border border-zinc-800 p-1 h-auto flex-wrap gap-1">
                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="intent" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Intent & Architecture
                </TabsTrigger>
                <TabsTrigger value="schemas" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <FileJson className="h-3.5 w-3.5" />
                  Schemas
                </TabsTrigger>
                <TabsTrigger value="validation" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Validation
                  {errorCount > 0 && (
                    <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] bg-red-500/10 text-red-400 border-red-500/30">
                      {errorCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="repair" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Repair Log
                  {repairedCount > 0 && (
                    <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                      {repairedCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="simulation" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Simulation
                </TabsTrigger>
                <TabsTrigger value="benchmark" className="text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-1.5 px-3 py-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Benchmarks
                </TabsTrigger>
              </TabsList>

              {/* ===== TAB: OVERVIEW ===== */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatCard label="Total Latency" value={`${totalLatency.toLocaleString()}ms`} icon={Clock} color="teal" />
                  <StatCard label="Total Tokens" value={totalTokens.toLocaleString()} icon={Zap} color="cyan" />
                  <StatCard label="Issues Found" value={issues.length} icon={Shield} color={errorCount > 0 ? 'red' : 'emerald'} />
                  <StatCard label="Repairs Applied" value={repairedCount} icon={Wrench} color={repairedCount > 0 ? 'amber' : 'emerald'} />
                  <StatCard
                    label="Final Status"
                    value={finalStatus.toUpperCase()}
                    icon={finalStatus === 'success' ? CheckCircle2 : finalStatus === 'partial' ? AlertTriangle : XCircle}
                    color={finalStatus === 'success' ? 'emerald' : finalStatus === 'partial' ? 'amber' : 'red'}
                  />
                </div>

                {/* Latency Chart */}
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-emerald-400" />
                      Stage Latencies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis
                            dataKey="name"
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            axisLine={{ stroke: '#3f3f46' }}
                          />
                          <YAxis
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            axisLine={{ stroke: '#3f3f46' }}
                            tickFormatter={(v) => `${v}ms`}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: '#18181b',
                              border: '1px solid #27272a',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: '#a1a1aa' }}
                            formatter={(value: number, name: string) => [
                              name === 'latency' ? `${value}ms` : value,
                              name === 'latency' ? 'Latency' : 'Tokens',
                            ]}
                          />
                          <Bar dataKey="latency" radius={[4, 4, 0, 0]}>
                            {chartData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={
                                  stages[i]?.status === 'success'
                                    ? '#10b981'
                                    : stages[i]?.status === 'repaired'
                                      ? '#f59e0b'
                                      : stages[i]?.status === 'failed'
                                        ? '#ef4444'
                                        : '#3f3f46'
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Stage Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stages.map((s, i) => (
                    <Card key={i} className="bg-zinc-900 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {(() => { const Icon = STAGE_ICONS[i]; return <Icon className="h-4 w-4 text-zinc-400" />; })()}
                            <span className="text-sm font-medium">Stage {s.stage + 1}</span>
                          </div>
                          <PipelineStageBadge status={s.status} />
                        </div>
                        <p className="text-xs text-zinc-400 mb-2">{s.name}</p>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {s.latencyMs}ms
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {s.tokenUsage} tokens
                          </span>
                          {s.retries > 0 && (
                            <span className="text-amber-400">{s.retries} retries</span>
                          )}
                        </div>
                        {s.errors.length > 0 && (
                          <div className="mt-2 text-xs text-red-400 space-y-0.5">
                            {s.errors.map((e, j) => (
                              <p key={j}>• {e}</p>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* ===== TAB: INTENT & ARCHITECTURE ===== */}
              <TabsContent value="intent" className="space-y-4">
                {pipelineResult.intent && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard
                        label="Features"
                        value={pipelineResult.intent.features.length}
                        icon={Sparkles}
                        color="teal"
                      />
                      <StatCard
                        label="Entities"
                        value={pipelineResult.intent.entities.length}
                        icon={Database}
                        color="amber"
                      />
                      <StatCard
                        label="Actors"
                        value={pipelineResult.intent.actors.length}
                        icon={Layers}
                        color="cyan"
                      />
                      <StatCard
                        label="Complexity"
                        value={pipelineResult.intent.complexity}
                        icon={Activity}
                        color={
                          pipelineResult.intent.complexity === 'simple'
                            ? 'emerald'
                            : pipelineResult.intent.complexity === 'moderate'
                              ? 'amber'
                              : pipelineResult.intent.complexity === 'complex'
                                ? 'orange'
                                : 'red'
                        }
                      />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                          Extracted Intent
                        </h3>
                        <JsonView data={pipelineResult.intent} label="intent.json" />
                      </div>
                    </div>
                  </>
                )}

                {pipelineResult.architecture && (
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-teal-400" />
                      Architecture Plan
                    </h3>
                    <JsonView data={pipelineResult.architecture} label="architecture.json" />
                  </div>
                )}

                {!pipelineResult.intent && !pipelineResult.architecture && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <Info className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-zinc-500 text-sm">No intent or architecture data available.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== TAB: SCHEMAS ===== */}
              <TabsContent value="schemas" className="space-y-4">
                <Tabs value={activeSchemaTab} onValueChange={setActiveSchemaTab} className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'ui', label: 'UI Schema', icon: Code, stat: pipelineResult.uiSchema ? `${pipelineResult.uiSchema.pages.length} pages` : null },
                      { key: 'api', label: 'API Schema', icon: Terminal, stat: pipelineResult.apiSchema ? `${pipelineResult.apiSchema.endpoints.length} endpoints` : null },
                      { key: 'db', label: 'DB Schema', icon: Database, stat: pipelineResult.dbSchema ? `${pipelineResult.dbSchema.tables.length} tables` : null },
                      { key: 'auth', label: 'Auth Schema', icon: Shield, stat: pipelineResult.authSchema ? `${pipelineResult.authSchema.roles.length} roles` : null },
                      { key: 'logic', label: 'Business Logic', icon: Wrench, stat: pipelineResult.businessLogic ? `${pipelineResult.businessLogic.rules.length} rules` : null },
                    ].map(({ key, label, icon: Icon, stat }) => (
                      <Button
                        key={key}
                        variant={activeSchemaTab === key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActiveSchemaTab(key)}
                        className={
                          activeSchemaTab === key
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 gap-1.5'
                            : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 gap-1.5'
                        }
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {stat && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 bg-zinc-800 text-zinc-400 ml-1">
                            {stat}
                          </Badge>
                        )}
                      </Button>
                    ))}
                  </div>

                  <TabsContent value="ui">
                    {pipelineResult.uiSchema ? (
                      <JsonView data={pipelineResult.uiSchema} label="ui-schema.json" />
                    ) : (
                      <EmptyState message="No UI schema generated" />
                    )}
                  </TabsContent>

                  <TabsContent value="api">
                    {pipelineResult.apiSchema ? (
                      <JsonView data={pipelineResult.apiSchema} label="api-schema.json" />
                    ) : (
                      <EmptyState message="No API schema generated" />
                    )}
                  </TabsContent>

                  <TabsContent value="db">
                    {pipelineResult.dbSchema ? (
                      <JsonView data={pipelineResult.dbSchema} label="db-schema.json" />
                    ) : (
                      <EmptyState message="No DB schema generated" />
                    )}
                  </TabsContent>

                  <TabsContent value="auth">
                    {pipelineResult.authSchema ? (
                      <JsonView data={pipelineResult.authSchema} label="auth-schema.json" />
                    ) : (
                      <EmptyState message="No Auth schema generated" />
                    )}
                  </TabsContent>

                  <TabsContent value="logic">
                    {pipelineResult.businessLogic ? (
                      <JsonView data={pipelineResult.businessLogic} label="business-logic.json" />
                    ) : (
                      <EmptyState message="No Business Logic schema generated" />
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* ===== TAB: VALIDATION ===== */}
              <TabsContent value="validation" className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Errors" value={errorCount} icon={XCircle} color={errorCount > 0 ? 'red' : 'emerald'} />
                  <StatCard label="Warnings" value={warningCount} icon={AlertTriangle} color={warningCount > 0 ? 'amber' : 'emerald'} />
                  <StatCard label="Info" value={infoCount} icon={Info} color="cyan" />
                </div>

                {issues.length > 0 ? (
                  <div className="space-y-2">
                    {issues.map((issue, i) => (
                      <ValidationIssueCard key={i} issue={issue} index={i} />
                    ))}
                  </div>
                ) : (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-emerald-400 text-sm font-medium">No validation issues found!</p>
                      <p className="text-zinc-500 text-xs mt-1">All schemas are consistent across layers.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== TAB: REPAIR LOG ===== */}
              <TabsContent value="repair" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total Repairs" value={repairs.length} icon={Wrench} color="amber" />
                  <StatCard label="Successful" value={repairedCount} icon={CheckCircle2} color="emerald" />
                </div>

                {repairs.length > 0 ? (
                  <div className="space-y-3">
                    {repairs.map((action, i) => (
                      <RepairActionCard key={i} action={action} index={i} />
                    ))}
                  </div>
                ) : (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-emerald-400 text-sm font-medium">No repairs needed!</p>
                      <p className="text-zinc-500 text-xs mt-1">All schemas passed validation.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== TAB: RUNTIME SIMULATION ===== */}
              <TabsContent value="simulation" className="space-y-4">
                {(() => {
                  const simStage = stages.find((s) => s.stage === 6);
                  const simOutput = simStage?.output as { checks?: Array<{ name: string; category: string; status: string; details: string; simulatedOutput?: string }> } | undefined;
                  const checks = simOutput?.checks ?? [];

                  const passCount = checks.filter((c) => c.status === 'pass').length;
                  const failCount = checks.filter((c) => c.status === 'fail').length;
                  const warnCount = checks.filter((c) => c.status === 'warning').length;

                  return (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <StatCard label="Passed" value={passCount} icon={CheckCircle2} color="emerald" />
                        <StatCard label="Failed" value={failCount} icon={XCircle} color={failCount > 0 ? 'red' : 'emerald'} />
                        <StatCard label="Warnings" value={warnCount} icon={AlertTriangle} color={warnCount > 0 ? 'amber' : 'emerald'} />
                      </div>

                      {checks.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {checks.map((check, i) => (
                            <Card key={i} className="bg-zinc-900 border-zinc-800">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <StatusIcon status={check.status} />
                                    <span className="text-sm font-medium">{check.name}</span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-bold ${
                                      check.status === 'pass'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : check.status === 'fail'
                                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    }`}
                                  >
                                    {check.status.toUpperCase()}
                                  </Badge>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-zinc-800 text-zinc-400 border-zinc-700 mb-2">
                                  {check.category}
                                </Badge>
                                <p className="text-xs text-zinc-400">{check.details}</p>
                                {check.simulatedOutput && (
                                  <div className="mt-2 bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                                    <code className="text-[10px] text-emerald-400 font-mono">{check.simulatedOutput}</code>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <Card className="bg-zinc-900 border-zinc-800">
                          <CardContent className="p-8 text-center">
                            <Cpu className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                            <p className="text-zinc-500 text-sm">No simulation data available.</p>
                            <p className="text-zinc-600 text-xs mt-1">Runtime checks run after successful compilation.</p>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  );
                })()}
              </TabsContent>

              {/* ===== TAB: BENCHMARKS ===== */}
              <TabsContent value="benchmark" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Benchmark Suite</h3>
                    <p className="text-xs text-zinc-500">Run the full pipeline against a curated dataset of product prompts.</p>
                  </div>
                  <Button
                    onClick={handleBenchmark}
                    disabled={isBenchmarking}
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                  >
                    {isBenchmarking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run Benchmarks
                      </>
                    )}
                  </Button>
                </div>

                {isBenchmarking && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
                        <span className="text-sm font-medium text-zinc-300">Running benchmarks...</span>
                      </div>
                      <Progress value={undefined} className="h-2 bg-zinc-800" />
                      <p className="text-xs text-zinc-500">This may take a few minutes. Each benchmark runs the full 6-stage pipeline.</p>
                    </CardContent>
                  </Card>
                )}

                {benchmarkData && !isBenchmarking && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard label="Total Prompts" value={benchmarkData.totalPrompts} icon={Activity} color="teal" />
                      <StatCard label="Successful" value={benchmarkData.successfulRuns} icon={CheckCircle2} color="emerald" />
                      <StatCard
                        label="Failed"
                        value={benchmarkData.totalPrompts - benchmarkData.successfulRuns}
                        icon={XCircle}
                        color={benchmarkData.totalPrompts - benchmarkData.successfulRuns > 0 ? 'red' : 'emerald'}
                      />
                      <StatCard label="Errors" value={benchmarkData.errors.length} icon={AlertTriangle} color="amber" />
                    </div>

                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="p-0">
                        <ScrollArea className="max-h-[400px]">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-zinc-800 hover:bg-transparent">
                                <TableHead className="text-xs text-zinc-400 font-medium">Prompt</TableHead>
                                <TableHead className="text-xs text-zinc-400 font-medium">Category</TableHead>
                                <TableHead className="text-xs text-zinc-400 font-medium">Success</TableHead>
                                <TableHead className="text-xs text-zinc-400 font-medium text-right">Latency</TableHead>
                                <TableHead className="text-xs text-zinc-400 font-medium text-right">Tokens</TableHead>
                                <TableHead className="text-xs text-zinc-400 font-medium text-right">Consistency</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {benchmarkData.results.map((result, i) => (
                                <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                                  <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate" title={result.prompt}>
                                    {result.subcategory || result.prompt.substring(0, 60)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        result.category === 'real_product'
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                      }`}
                                    >
                                      {result.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {result.metrics.success ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-400" />
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-zinc-400 text-right">
                                    {result.metrics.totalLatencyMs.toLocaleString()}ms
                                  </TableCell>
                                  <TableCell className="text-xs text-zinc-400 text-right">
                                    {result.metrics.totalTokens.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span
                                      className={`text-xs font-bold ${
                                        result.metrics.consistencyScore >= 0.8
                                          ? 'text-emerald-400'
                                          : result.metrics.consistencyScore >= 0.5
                                            ? 'text-amber-400'
                                            : 'text-red-400'
                                      }`}
                                    >
                                      {(result.metrics.consistencyScore * 100).toFixed(0)}%
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </>
                )}

                {!benchmarkData && !isBenchmarking && (
                  <Card className="bg-zinc-900 border-zinc-800 border-dashed">
                    <CardContent className="p-8 text-center">
                      <Activity className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-zinc-400 text-sm">No benchmarks run yet</p>
                      <p className="text-zinc-600 text-xs mt-1">Click &ldquo;Run Benchmarks&rdquo; to evaluate the pipeline.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {/* ===== COST VS QUALITY ANALYSIS ===== */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Coins className="h-5 w-5 text-emerald-400" />
                  Cost vs Quality Analysis
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Compare two operating modes for the compiler pipeline.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {costAnalysis ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CostModeCard
                      title="Low Cost Mode"
                      description="Fast, affordable — ideal for prototyping"
                      profile={costAnalysis.lowCostMode}
                      accentColor="amber"
                      icon={Zap}
                    />
                    <CostModeCard
                      title="High Reliability Mode"
                      description="Thorough, production-grade — ideal for deployment"
                      profile={costAnalysis.highReliabilityMode}
                      accentColor="emerald"
                      icon={Shield}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-64 rounded-xl bg-zinc-800" />
                    <Skeleton className="h-64 rounded-xl bg-zinc-800" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== EMPTY STATE (before first compile) ===== */}
        {!pipelineResult && !isCompiling && (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
              <Zap className="h-10 w-10 text-emerald-500/50" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-200 mb-2">Ready to Compile</h2>
            <p className="text-zinc-500 max-w-md mb-8 text-sm">
              Enter a product description above and click <span className="text-emerald-400">&ldquo;Compile&rdquo;</span> to
              run it through the full 6-stage compiler pipeline.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
              {[
                { icon: Sparkles, title: 'Stage 1-2', desc: 'Intent extraction & architecture planning', color: 'text-emerald-400 bg-emerald-500/10' },
                { icon: Code, title: 'Stage 3-4', desc: 'Schema generation & cross-layer validation', color: 'text-teal-400 bg-teal-500/10' },
                { icon: Cpu, title: 'Stage 5-6', desc: 'Auto-repair & runtime simulation', color: 'text-cyan-400 bg-cyan-500/10' },
              ].map(({ icon: Icon, title, desc, color }) => (
                <Card key={title} className="border-dashed border-zinc-800 bg-zinc-900/50">
                  <CardContent className="p-4 text-center">
                    <div className={`inline-flex p-2 rounded-lg mb-2 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold text-zinc-300">{title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-zinc-600">
            AppForge — LLM Application Compiler System
          </p>
          <p className="text-xs text-zinc-700">
            6-Stage Pipeline • TypeScript • Production-Grade
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-8 text-center">
        <FileJson className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-zinc-500 text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

function ValidationIssueCard({ issue, index }: { issue: { id: string; severity: string; layer: string; category: string; description: string; affectedFields: string[]; suggestion: string; autoRepairable: boolean; repairedBy?: string }; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors">
      <button
        className="w-full text-left p-3 flex items-start gap-3 bg-transparent hover:bg-zinc-800/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <StatusIcon status={issue.severity === 'error' ? 'failed' : issue.severity === 'warning' ? 'warning' : 'pass'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <code className="text-[10px] font-mono text-zinc-500">#{index + 1}</code>
            <LayerBadge layer={issue.layer} />
            <SeverityBadge severity={issue.severity} />
            <Badge variant="outline" className="text-[10px] bg-zinc-800 text-zinc-400 border-zinc-700">
              {issue.category}
            </Badge>
            {issue.autoRepairable && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                auto-repairable
              </Badge>
            )}
            {issue.repairedBy && issue.repairedBy !== 'none' && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                repaired
              </Badge>
            )}
          </div>
          <p className="text-sm text-zinc-300">{issue.description}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0 mt-1" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0 mt-1" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-zinc-800 bg-zinc-950/50">
          <div className="pt-2">
            <p className="text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wider">Affected Fields</p>
            <div className="flex flex-wrap gap-1">
              {issue.affectedFields.map((f) => (
                <code key={f} className="text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300">
                  {f}
                </code>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wider">Suggestion</p>
            <p className="text-xs text-zinc-400">{issue.suggestion}</p>
          </div>
          {issue.repairedBy && issue.repairedBy !== 'none' && (
            <div>
              <p className="text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wider">Repair Method</p>
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                {issue.repairedBy}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepairActionCard({ action, index }: { action: { action: string; targetLayer: string; targetComponent: string; description: string; success: boolean; changes: Array<{ field: string; oldValue: unknown; newValue: unknown; reason: string }> }; index: number }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={action.success ? 'success' : 'failed'} />
          <Badge variant="outline" className="text-[10px] font-bold bg-zinc-800 text-zinc-300 border-zinc-700">
            {action.action}
          </Badge>
          <LayerBadge layer={action.targetLayer} />
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">#{index + 1}</span>
      </div>
      <p className="text-sm text-zinc-300 mb-1">{action.description}</p>
      <code className="text-[10px] text-zinc-500 font-mono">{action.targetComponent}</code>
      {action.changes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Changes</p>
          {action.changes.map((change, ci) => (
            <div key={ci} className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800 text-xs">
              <div className="flex items-center gap-1 text-zinc-500 mb-1">
                <span className="font-mono text-zinc-400 font-medium">{change.field}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Before</span>
                  <code className="block text-[10px] text-red-300/80 bg-red-500/5 rounded px-1.5 py-1 mt-0.5 border border-red-500/10 truncate">
                    {JSON.stringify(change.oldValue)}
                  </code>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider">After</span>
                  <code className="block text-[10px] text-emerald-300/80 bg-emerald-500/5 rounded px-1.5 py-1 mt-0.5 border border-emerald-500/10 truncate">
                    {JSON.stringify(change.newValue)}
                  </code>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5 italic">{change.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostModeCard({
  title,
  description,
  profile,
  accentColor,
  icon: Icon,
}: {
  title: string;
  description: string;
  profile: CostProfile;
  accentColor: 'emerald' | 'amber';
  icon: React.ElementType;
}) {
  const colorMap = {
    emerald: {
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      text: 'text-emerald-400',
      barBg: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/10',
      muted: 'text-emerald-400/70',
    },
    amber: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      text: 'text-amber-400',
      barBg: 'bg-amber-500',
      iconBg: 'bg-amber-500/10',
      muted: 'text-amber-400/70',
    },
  };
  const c = colorMap[accentColor];

  const qualityPct = Math.round(profile.qualityScore * 100);
  const maxCost = Math.max(profile.estimatedCostPerRequest, 1);
  const costBarWidth = Math.min((profile.estimatedCostPerRequest / 0.5) * 100, 100);
  const latencyBarWidth = Math.min((profile.avgLatencyMs / 15000) * 100, 100);

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 space-y-4`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${c.iconBg}`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div>
          <h3 className={`font-semibold text-sm ${c.text}`}>{title}</h3>
          <p className="text-[11px] text-zinc-500">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className={`text-xl font-bold ${c.text}`}>
            ${profile.estimatedCostPerRequest.toFixed(2)}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Cost / Request</p>
        </div>
        <div className="text-center">
          <p className={`text-xl font-bold ${c.text}`}>
            {profile.avgLatencyMs >= 1000
              ? `${(profile.avgLatencyMs / 1000).toFixed(1)}s`
              : `${profile.avgLatencyMs}ms`}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Avg Latency</p>
        </div>
        <div className="text-center">
          <p className={`text-xl font-bold ${c.text}`}>{qualityPct}%</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Quality</p>
        </div>
      </div>

      {/* Visual Bars */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Cost</span>
            <span>${profile.estimatedCostPerRequest.toFixed(3)}</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full ${c.barBg} rounded-full transition-all duration-700`} style={{ width: `${costBarWidth}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Latency</span>
            <span>{profile.avgLatencyMs.toLocaleString()}ms</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full ${c.barBg} rounded-full opacity-70 transition-all duration-700`} style={{ width: `${latencyBarWidth}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Quality</span>
            <span>{qualityPct}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full ${c.barBg} rounded-full opacity-50 transition-all duration-700`} style={{ width: `${qualityPct}%` }} />
          </div>
        </div>
      </div>

      {/* Tradeoffs */}
      <div>
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Tradeoffs</p>
        <ul className="space-y-1">
          {profile.tradeoffs.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
              <span className={`${c.muted} mt-0.5`}>•</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
