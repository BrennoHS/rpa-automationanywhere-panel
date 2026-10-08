import type { RobotRun } from "../types";

/** Cor por resultado da execução - mesma paleta usada no resto do painel. */
export const OUTCOME_COLORS: Record<RobotRun["outcome"], string> = {
  success: "#34d399",
  failure: "#f87171",
  excluded: "#94a3b8",
};

/**
 * Rótulo legível do status cru do Control Room. Usa `includes` (não
 * igualdade exata) porque o valor real tem prefixo "RUN_" (confirmado via
 * execução real: "RUN_FAILED", não "FAILED" como um CSV exportado sugeria -
 * ver CONTEXTO-SESSAO.md, 2026-09-21) - mais resistente a variação de enum
 * do que testar a string exata.
 */
export function runStatusLabel(status: string): string {
  if (status.includes("ABORTED")) return "Parada manualmente";
  if (status.includes("TIMED_OUT")) return "Tempo esgotado";
  if (status.includes("FAILED")) return "Falhou";
  if (status.includes("COMPLETED")) return "Concluída";
  if (["RUNNING", "DEPLOYED", "UPDATE", "QUEUED"].includes(status)) return "Em andamento";
  return status;
}
