import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Guarda dois dados pequenos e persistentes, em um unico arquivo JSON:
 *  - quais robos (fileId) o time de sustentacao marcou como "Monitorar"
 *  - a data/hora da ULTIMA falha ja notificada de cada um (pra nao mandar a
 *    mesma falha pro Teams toda vez que alguem abrir o Dashboard)
 *
 * NAO e a mesma coisa que "salvar historico de execucoes localmente" (isso
 * continua fora de escopo) - e so um estado pequeno de toggle + deduplicacao,
 * do tamanho de um punhado de robos monitorados, nao de todo o historico.
 */
interface MonitoringState {
  monitored: string[];
  lastNotifiedFailureAt: Record<string, string>;
}

const STATE_FILE = path.join(env.dataDir, "monitoring-state.json");

function readState(): MonitoringState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MonitoringState>;
    return {
      monitored: Array.isArray(parsed.monitored) ? parsed.monitored : [],
      lastNotifiedFailureAt: parsed.lastNotifiedFailureAt ?? {},
    };
  } catch {
    return { monitored: [], lastNotifiedFailureAt: {} };
  }
}

function writeState(state: MonitoringState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function isMonitored(fileId: string): boolean {
  return readState().monitored.includes(fileId);
}

export function getMonitoredIds(): string[] {
  return readState().monitored;
}

export function setMonitored(fileId: string, monitored: boolean): void {
  const state = readState();
  const has = state.monitored.includes(fileId);
  if (monitored && !has) {
    state.monitored.push(fileId);
  } else if (!monitored && has) {
    state.monitored = state.monitored.filter((id) => id !== fileId);
    delete state.lastNotifiedFailureAt[fileId];
  } else {
    return;
  }
  writeState(state);
}

export function getLastNotifiedFailureAt(fileId: string): string | undefined {
  return readState().lastNotifiedFailureAt[fileId];
}

export function setLastNotifiedFailureAt(fileId: string, startDateTime: string): void {
  const state = readState();
  state.lastNotifiedFailureAt[fileId] = startDateTime;
  writeState(state);
}
