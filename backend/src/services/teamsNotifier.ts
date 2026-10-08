import { env } from "../config/env";

/**
 * Notifica o grupo de sustentacao no Teams quando um robo MONITORADO falha.
 * Webhook: Power Automate, gatilho "Quando uma solicitacao de webhook do
 * Teams e recebida" -> acao "Postar cartao em um chat ou canal".
 *
 * MODO MOCK POR PADRAO (decisao do time, 2026-08-31): enquanto
 * NOTIFY_TEAMS_LIVE != "true" no .env, NADA e enviado de verdade - so loga
 * no console o que seria enviado. Isso existe porque esse app nao tem
 * scheduler/cron (so roda quando alguem abre o Dashboard), entao a deteccao
 * de falha nao e tempo real de verdade ainda - o time quis validar isso com
 * calma antes de ligar o envio real pro canal.
 *
 * ATENCAO: os nomes de campo do payload abaixo sao um formato razoavel, mas
 * o fluxo do Power Automate e quem decide como mapear isso pro cartao -
 * pode ser preciso ajustar os nomes de campo aqui pra baterem com o que o
 * fluxo espera. Testar com NOTIFY_TEAMS_LIVE=true so depois de confirmar o
 * mapeamento certo com quem configurou o fluxo.
 */
export interface FailureNotification {
  robotId: string;
  robotName: string;
  machine: string;
  errorMessage: string;
  startedAt: string;
  endedAt: string;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/** Compartilhado com teamsServiceNowNotifier.ts - mesmo POST com timeout, dois webhooks diferentes. */
export async function postWithTimeout(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Webhook do Teams -> HTTP ${resp.status}: ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyFailure(n: FailureNotification): Promise<void> {
  const payload = {
    title: `Robô com falha: ${n.robotName}`,
    robotId: n.robotId,
    robotName: n.robotName,
    machine: n.machine,
    status: "Failed",
    errorMessage: n.errorMessage || "(sem mensagem de erro)",
    startedAt: n.startedAt,
    endedAt: n.endedAt,
  };

  if (!env.notifyTeamsLive) {
    console.log("[teams-notify] MOCK (NOTIFY_TEAMS_LIVE != true) - enviaria pro Teams:", JSON.stringify(payload));
    return;
  }

  if (!env.teamsWebhookUrl) {
    console.error("[teams-notify] NOTIFY_TEAMS_LIVE=true mas TEAMS_WEBHOOK_URL nao esta configurado no .env - nada enviado.");
    return;
  }

  try {
    await postWithTimeout(env.teamsWebhookUrl, payload);
    console.log(`[teams-notify] Notificacao enviada pro Teams: ${n.robotName} (${n.robotId})`);
  } catch (err) {
    // Falha ao notificar nao pode derrubar a resposta do Dashboard - so loga.
    console.error("[teams-notify] Falha ao enviar pro Teams:", err);
  }
}
