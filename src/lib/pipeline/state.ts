/**
 * サーバーサイドパイプラインの状態管理
 * メモリ内で状態を保持し、ページ遷移しても処理が続行される
 */

export interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  processed: number;
  total: number;
  errors: string[];
}

export interface PipelineState {
  running: boolean;
  startedAt: string | null;
  keyword: string;
  maxItems: number;
  autoProcess: boolean;
  steps: PipelineStep[];
  aborted: boolean;
}

const defaultSteps: PipelineStep[] = [
  { id: "scrape", label: "検索・取得", status: "pending", processed: 0, total: 0, errors: [] },
  { id: "details", label: "詳細取得", status: "pending", processed: 0, total: 0, errors: [] },
  { id: "images", label: "画像処理", status: "pending", processed: 0, total: 0, errors: [] },
  { id: "costs", label: "費用計算", status: "pending", processed: 0, total: 0, errors: [] },
];

// Module-level state (persists across requests in the same Node.js process)
let pipelineState: PipelineState = {
  running: false,
  startedAt: null,
  keyword: "",
  maxItems: 0,
  autoProcess: true,
  steps: defaultSteps.map((s) => ({ ...s })),
  aborted: false,
};

export function getState(): PipelineState {
  return { ...pipelineState, steps: pipelineState.steps.map((s) => ({ ...s, errors: [...s.errors] })) };
}

export function updateStep(id: string, updates: Partial<PipelineStep>) {
  pipelineState.steps = pipelineState.steps.map((s) =>
    s.id === id ? { ...s, ...updates, errors: updates.errors ?? [...s.errors] } : s
  );
}

export function resetState(keyword: string, maxItems: number, autoProcess: boolean) {
  pipelineState = {
    running: true,
    startedAt: new Date().toISOString(),
    keyword,
    maxItems,
    autoProcess,
    steps: defaultSteps.map((s) => ({ ...s, errors: [] })),
    aborted: false,
  };
}

export function setRunning(running: boolean) {
  pipelineState.running = running;
}

export function abort() {
  pipelineState.aborted = true;
}

export function isAborted(): boolean {
  return pipelineState.aborted;
}
