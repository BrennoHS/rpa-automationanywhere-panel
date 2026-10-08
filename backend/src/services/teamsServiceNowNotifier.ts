import { env } from "../config/env";
import { postWithTimeout } from "./teamsNotifier";

/**
 * Notifica o canal do Teams quando um chamado NOVO abre numa das duas filas
 * do ServiceNow (Produtos Digitais / Suporte RPA). Webhook SEPARADO do de
 * falha de robô (teamsNotifier.ts) - fluxo próprio no Power Automate.
 *
 * O gatilho desse fluxo é do tipo especial "TeamsWebhook", mas o schema que
 * ele mostra no Designer é só um modelo padrao pra sugestao de conteudo
 * dinamico - NAO e o que a acao "Post card in a chat or channel" de fato
 * espera. Confirmado abrindo o fluxo real (2026-09-18): ele guarda o corpo
 * inteiro da requisicao numa variavel ("Initialize variable (Body)" = Corpo,
 * ou seja triggerBody() puro) e manda ISSO direto, stringificado
 * (`string(variables('Body'))`), como o valor do campo "Cartao Adaptavel".
 * Ou seja: o corpo que a gente envia por POST PRECISA SER o cartao adaptavel
 * em si, na raiz - SEM nenhum envelope tipo {type:"message", attachments:
 * [...]} (essa era a primeira tentativa, gerava erro "Property 'type' must
 * be 'AdaptiveCard'" porque a raiz do que chegava era "message", nao
 * "AdaptiveCard").
 *
 * MESMO padrão mock-por-padrão do outro webhook: enquanto
 * NOTIFY_TEAMS_SERVICENOW_LIVE != "true" no .env, nada é enviado de
 * verdade - só loga no console o que seria enviado. Ver checkNewTickets()
 * em serviceNowService.ts pra saber quando isso dispara (reage à mesma
 * busca já feita pra tela, sem scheduler/cron - só quando alguém abre/
 * atualiza a tela do ServiceNow).
 */
export interface NewTicketNotification {
  number: string;
  description: string;
  sintoma: string;
  subcategoria: string;
  origin: string;
  priority: string;
  requester: string;
  openedAt: string;
  url: string;
}

/** Monta o cartão adaptável PURO - é exatamente isso que vira o corpo do POST, sem nenhum envelope em volta. */
function buildAdaptiveCard(n: NewTicketNotification) {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "🎫 Novo chamado aberto",
        weight: "Bolder",
        size: "Medium",
        color: "Accent",
      },
      {
        type: "TextBlock",
        text: n.number,
        weight: "Bolder",
        size: "Large",
        spacing: "None",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Sintoma", value: n.sintoma || "—" },
          { title: "Subcategoria", value: n.subcategoria || "—" },
          { title: "Origem", value: n.origin || "—" },
          { title: "Prioridade", value: n.priority || "—" },
          { title: "Aberto por", value: n.requester || "—" },
          { title: "Aberto em", value: n.openedAt || "—" },
        ],
      },
      {
        type: "TextBlock",
        text: n.description || "(sem descrição)",
        wrap: true,
        spacing: "Medium",
      },
    ],
    actions: n.url ? [{ type: "Action.OpenUrl", title: "Abrir no ServiceNow", url: n.url }] : [],
  };
}

export async function notifyNewTicket(n: NewTicketNotification): Promise<void> {
  const payload = buildAdaptiveCard(n);

  if (!env.notifyTeamsServiceNowLive) {
    console.log(`[teams-notify-sn] MOCK (NOTIFY_TEAMS_SERVICENOW_LIVE != true) - enviaria cartao pro Teams do chamado ${n.number}:`, JSON.stringify(payload));
    return;
  }

  if (!env.teamsServiceNowWebhookUrl) {
    console.error("[teams-notify-sn] NOTIFY_TEAMS_SERVICENOW_LIVE=true mas TEAMS_SERVICENOW_WEBHOOK_URL nao esta configurado no .env - nada enviado.");
    return;
  }

  try {
    await postWithTimeout(env.teamsServiceNowWebhookUrl, payload);
    console.log(`[teams-notify-sn] Notificacao enviada pro Teams: chamado ${n.number}`);
  } catch (err) {
    // Falha ao notificar nao pode derrubar a resposta da tela - so loga.
    console.error("[teams-notify-sn] Falha ao enviar pro Teams:", err);
  }
}
