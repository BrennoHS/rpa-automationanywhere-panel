import fs from "fs";
import path from "path";
import { env } from "../config/env";

interface CategoryCount {
  label: string;
  count: number;
}

interface ReviewItem {
  number: string;
  text: string;
  sintoma: string;
  subcategoria: string;
  requester: string;
  assignedTo: string;
  url: string;
}

interface TicketDetail {
  number: string;
  description: string;
  sintoma: string;
  subcategoria: string;
  resolved: boolean;
  isAutomation: boolean;
  label: string;
  resolutionNote: string;
  url: string;
  requester: string;
  assignedTo: string;
  openedAt: string;
  priority: string;
  origin: string;
}

interface OverflowTicket {
  number: string;
  description: string;
  sintoma: string;
  requester: string;
  assignedTo: string;
  openedAt: string;
  url: string;
  resolved: boolean;
  closedAt: string;
}

interface Melhoria {
  number: string;
  description: string;
  state: string;
  requester: string;
  assignedTo: string;
  symptom: string;
  openedAt: string;
  url: string;
  resolved: boolean;
  closedAt: string;
}

interface SlaCompliance {
  evaluated: number;
  percentage: number | null;
}

interface MttrStats {
  evaluated: number;
  avgMinutes: number | null;
}

/**
 * Resumo COMPLETO de um mes especifico (ver botao "voltar mes" do grafico de
 * tendencia) - mais rico que FrozenMonthTrend (trendHistoryStore.ts), que so
 * guarda total+quebra automacao/produto pro grafico. Aqui vai tudo que a
 * tela precisa pra mostrar/exportar um mes fechado como se fosse o mes
 * corrente: quebras, chamados pra revisar, lista completa de chamados,
 * SLA/MTTR. Mesma logica de "mes fechado nunca muda" - congela na primeira
 * vez que alguem clica naquele mes, nunca mais busca de novo.
 */
export interface FrozenMonthSummary {
  month: string;
  label: string;
  ticketsThisMonth: number;
  /** Opcionais: meses congelados antes de existir transbordo/melhorias por mes nao tem esses campos - o servico completa na proxima leitura (ver fetchMonthSummary). */
  ticketsOverflow?: number;
  overflowTickets?: OverflowTicket[];
  melhorias?: Melhoria[];
  /** Dos chamados abertos NESSE mes, quantos continuam sem resolver até hoje - substitui "em atendimento" (que so faz sentido pro backlog atual, nao pra mes passado). */
  stillOpen: number;
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
  byOrigin: CategoryCount[];
  byPriority: CategoryCount[];
  needsReview: ReviewItem[];
  tickets: TicketDetail[];
  slaCompliance: SlaCompliance;
  mttr: MttrStats;
}

const STATE_FILE = path.join(env.dataDir, "month-summary-history.json");

function readState(): Record<string, FrozenMonthSummary> {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, FrozenMonthSummary>;
  } catch {
    return {};
  }
}

function writeState(state: Record<string, FrozenMonthSummary>): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function getFrozenMonthSummary(month: string): FrozenMonthSummary | undefined {
  return readState()[month];
}

export function setFrozenMonthSummary(entry: FrozenMonthSummary): void {
  const state = readState();
  state[entry.month] = entry;
  writeState(state);
}
