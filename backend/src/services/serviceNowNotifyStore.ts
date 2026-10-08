import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Guarda quais numeros de chamado JA foram notificados no Teams (pra nao
 * notificar o mesmo chamado de novo toda vez que alguem abrir a tela do
 * ServiceNow) - mesmo padrao de arquivo JSON pequeno usado por
 * monitoringStore.ts/trendHistoryStore.ts.
 *
 * "initialized" existe pra resolver um problema especifico: na PRIMEIRA vez
 * que essa checagem roda, os chamados do mes corrente ja existem (nao sao
 * "novos" de verdade, so nunca foram vistos por essa feature ainda). Sem essa
 * flag, ligar a feature no meio do mes dispararia notificacao retroativa de
 * TODOS os chamados ja abertos ate ali de uma vez - a primeira execucao so
 * grava o que ja existe como "conhecido", sem notificar nada; só a partir da
 * segunda execucao (chamado que nao estava na lista anterior) e que notifica.
 */
interface NotifyState {
  initialized: boolean;
  notified: string[];
}

const STATE_FILE = path.join(env.dataDir, "servicenow-notified-tickets.json");

function readState(): NotifyState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NotifyState>;
    return {
      initialized: parsed.initialized === true,
      notified: Array.isArray(parsed.notified) ? parsed.notified : [],
    };
  } catch {
    return { initialized: false, notified: [] };
  }
}

function writeState(state: NotifyState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function getNotifiedNumbers(): Set<string> {
  return new Set(readState().notified);
}

/** Se ainda nao inicializado, grava os numeros recebidos como baseline (sem notificar) e retorna true. Se ja inicializado, nao faz nada e retorna false. */
export function seedIfEmpty(numbers: string[]): boolean {
  const state = readState();
  if (state.initialized) return false;
  const merged = new Set([...state.notified, ...numbers]);
  writeState({ initialized: true, notified: Array.from(merged) });
  return true;
}

export function markNotified(numbers: string[]): void {
  if (numbers.length === 0) return;
  const state = readState();
  const merged = new Set([...state.notified, ...numbers]);
  writeState({ initialized: true, notified: Array.from(merged) });
}
