/**
 * Formata datetime ISO do Control Room ("2026-08-05T16:55:14.815437800Z")
 * pra "2026-08-05 16:55:14" - sem T, sem fracao de segundo, sem Z.
 * Mantem intacto o texto do mock ("hoje 06:00"), que nao tem "T".
 */
export function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const [datePart, timePart] = iso.split("T");
  if (!timePart) return datePart;
  const time = timePart.replace("Z", "").split(".")[0];
  return `${datePart} ${time}`;
}

/**
 * Formata minutos (que vem com casas decimais de sobra do calculo, tipo
 * 61.32749333333334) pra algo legivel: "45min" abaixo de 1h, "1h 01min" a
 * partir dai, "Xd Yh" a partir de 24h (duração de chamado pode passar de um
 * dia, diferente de execução de robô que nunca chega perto disso).
 */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total}min`;
  if (total < 1440) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}h ${String(m).padStart(2, "0")}min`;
  }
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  return `${d}d ${h}h`;
}

/**
 * Duração de UMA execução, com segundos - bot que roda em poucos minutos (ou
 * segundos) não pode aparecer como "0min" ou "1min" arredondado. Acima de 1h
 * cai no formatDuration normal.
 */
export function formatRunDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const totalSec = Math.round(minutes * 60);
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s ? `${m}min ${String(s).padStart(2, "0")}s` : `${m}min`;
  }
  return formatDuration(minutes);
}

/** "2026-09-18T16:55:14.8Z" -> "18/09 16:55" (rótulo curto de eixo de gráfico, mesma hora que o resto do painel mostra). */
export function shortDateTime(iso: string): string {
  const [datePart, timePart] = iso.split("T");
  if (!timePart) return iso;
  const [, month, day] = datePart.split("-");
  return `${day}/${month} ${timePart.slice(0, 5)}`;
}

/** "há X min"/"há Xh" a partir de um timestamp - usado no indicador "Atualizado há...". */
export function relativeTimeLabel(fromMs: number): string {
  const diffMin = Math.floor((Date.now() - fromMs) / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin === 1) return "há 1 min";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return `há ${diffH}h`;
}
