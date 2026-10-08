import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Congela cada mes JA FECHADO da tendencia de 6 meses num unico arquivo JSON,
 * chave = "YYYY-MM". Mes fechado nao ganha chamado novo (opened_at nunca
 * muda depois que o mes vira) - uma vez calculado, nunca mais precisa buscar
 * no ServiceNow, resolvendo tanto a lentidao (buscar 6 meses de uma vez e
 * caro no ServiceNow, buscar 1 mes e barato) quanto a carga repetida.
 *
 * O congelamento e SOB DEMANDA (lazy) - acontece na primeira vez que alguem
 * pede um mes que ja fechou e ainda nao esta no arquivo (ex.: a primeira
 * pessoa a abrir a tela depois que o mes vira). Mesmo padrao "dispara quando
 * alguem abre a tela" usado no resto do projeto - sem cron/scheduler novo.
 *
 * O mes ATUAL nunca entra aqui - sempre buscado ao vivo (ainda esta enchendo).
 */
interface CategoryCount {
  label: string;
  count: number;
}

export interface FrozenMonthTrend {
  month: string;
  label: string;
  total: number;
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
}

const STATE_FILE = path.join(env.dataDir, "trend-history.json");

function readState(): Record<string, FrozenMonthTrend> {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, FrozenMonthTrend>;
  } catch {
    return {};
  }
}

function writeState(state: Record<string, FrozenMonthTrend>): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function getFrozenMonth(month: string): FrozenMonthTrend | undefined {
  return readState()[month];
}

export function setFrozenMonth(entry: FrozenMonthTrend): void {
  const state = readState();
  state[entry.month] = entry;
  writeState(state);
}
