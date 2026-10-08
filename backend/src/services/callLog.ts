import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Log de chamadas do backend - existe pra dar pra CONFERIR de verdade quantas
 * chamadas o painel faz ao Control Room / ServiceNow (e quantas o frontend faz
 * pro backend) antes de apontar pra um ambiente sensivel.
 *
 * Tres alvos:
 *   CR  - chamadas do backend pro Control Room (Automation Anywhere)
 *   SN  - chamadas do backend pro ServiceNow
 *   API - requisicoes que o navegador faz pro proprio backend
 *
 * So registra metadados (metodo, caminho, status, tempo, tamanho, qtd de
 * registros) - NUNCA corpo de requisicao, token nem senha. Desliga com
 * LOG_CALLS=false no .env. Console + arquivo backend/logs/calls.log (*.log ja
 * esta no .gitignore).
 */

export type CallTarget = "CR" | "SN" | "API";

export interface CallEntry {
  ts: number;
  n: number;
  target: CallTarget;
  method: string;
  path: string;
  status: number | "ERR";
  ms: number;
  bytes: number | null;
  records?: number | null;
  note?: string;
}

const RECENT_MAX = 300;
const recent: CallEntry[] = [];
const counters: Record<CallTarget, { calls: number; errors: number; bytes: number; ms: number }> = {
  CR: { calls: 0, errors: 0, bytes: 0, ms: 0 },
  SN: { calls: 0, errors: 0, bytes: 0, ms: 0 },
  API: { calls: 0, errors: 0, bytes: 0, ms: 0 },
};
const cacheCounters = new Map<string, { HIT: number; MISS: number; JOIN: number }>();
let startedAt = Date.now();

const logFile = path.resolve(process.cwd(), "logs", "calls.log");
let fileReady = false;

function writeFile(line: string) {
  try {
    if (!fileReady) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fileReady = true;
    }
    fs.appendFile(logFile, line + "\n", () => undefined);
  } catch {
    // log nunca pode derrubar o servidor
  }
}

function fmtBytes(b: number | null): string {
  if (b == null) return "?";
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}

function clock(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

function emit(line: string) {
  console.log(line);
  writeFile(`${new Date().toISOString()} ${line}`);
}

export function logCall(e: Omit<CallEntry, "ts" | "n">): void {
  if (!env.logCalls) return;
  const c = counters[e.target];
  c.calls += 1;
  c.ms += e.ms;
  if (e.bytes) c.bytes += e.bytes;
  if (e.status === "ERR" || (typeof e.status === "number" && e.status >= 400)) c.errors += 1;

  const entry: CallEntry = { ...e, ts: Date.now(), n: c.calls, path: e.path.slice(0, 220) };
  recent.push(entry);
  if (recent.length > RECENT_MAX) recent.shift();

  const rec = entry.records != null ? ` · ${entry.records} reg` : "";
  const note = entry.note ? ` · ${entry.note}` : "";
  emit(
    `[calls] ${clock(entry.ts)} ${entry.target.padEnd(3)} ${entry.method.padEnd(4)} ${entry.path} -> ${entry.status} · ${entry.ms}ms · ${fmtBytes(entry.bytes)}${rec}${note} (#${entry.n})`
  );
}

/** Registra o resultado do cache de uma busca: HIT = serviu do cache, MISS = foi buscar, JOIN = esperou uma busca ja em andamento. */
export function logCache(name: string, event: "HIT" | "MISS" | "JOIN"): void {
  if (!env.logCalls) return;
  const c = cacheCounters.get(name) ?? { HIT: 0, MISS: 0, JOIN: 0 };
  c[event] += 1;
  cacheCounters.set(name, c);
  emit(`[cache] ${clock(Date.now())} ${name} ${event}`);
}

export function getCallStats() {
  const now = Date.now();
  const since = (ms: number) => recent.filter((e) => now - e.ts <= ms);
  const byTarget = (list: CallEntry[]) => ({
    CR: list.filter((e) => e.target === "CR").length,
    SN: list.filter((e) => e.target === "SN").length,
    API: list.filter((e) => e.target === "API").length,
  });
  return {
    enabled: env.logCalls,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    totals: counters,
    lastMinute: byTarget(since(60_000)),
    last5Minutes: byTarget(since(5 * 60_000)),
    cache: Object.fromEntries(cacheCounters),
    recent: recent.slice(-100).map((e) => ({
      time: clock(e.ts),
      target: e.target,
      method: e.method,
      path: e.path,
      status: e.status,
      ms: e.ms,
      bytes: e.bytes,
      records: e.records ?? null,
      note: e.note ?? null,
    })),
  };
}

export function resetCallStats(): void {
  recent.length = 0;
  for (const k of Object.keys(counters) as CallTarget[]) counters[k] = { calls: 0, errors: 0, bytes: 0, ms: 0 };
  cacheCounters.clear();
  startedAt = Date.now();
}
