import type { HealthLevel } from "../types";

/**
 * Regra de negocio do Health Score, baseada nas ultimas 10 execucoes:
 *  0-1 falha   -> Verde        (Saudavel)
 *  2-3 falhas  -> Verde claro  (Bom)
 *  4-6 falhas  -> Amarelo      (Atencao)
 *  7-8 falhas  -> Laranja      (Degradado)
 *  9-10 falhas -> Vermelho     (Critico)
 */
export const HEALTH: HealthLevel[] = [
  { max: 1, key: "healthy", label: "Saudável", color: "#34d399" },
  { max: 3, key: "good", label: "Bom", color: "#a3e635" },
  { max: 6, key: "warn", label: "Atenção", color: "#facc15" },
  { max: 8, key: "degraded", label: "Degradado", color: "#fb923c" },
  { max: 10, key: "critical", label: "Crítico", color: "#f87171" },
];

export const healthOf = (fails: number): HealthLevel =>
  HEALTH.find((h) => fails <= h.max) ?? HEALTH[HEALTH.length - 1];
