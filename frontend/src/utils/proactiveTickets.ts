import type { TicketDetail } from "../services/serviceNowService";

/**
 * "Aberto por" = a conta de serviço que a automação de detecção de falha usa
 * pra abrir chamado sozinha (vendo falha no Control Room) identifica um
 * chamado PROATIVO. Qualquer outro solicitante = REATIVO (pessoa abriu na
 * mão). Configurável via VITE_PROACTIVE_REQUESTER no .env do frontend -
 * coloque o username que SUA automação usa pra abrir chamado. Usado tanto na
 * tela quanto no export - fica num lugar só pra não divergir a lógica.
 */
const PROACTIVE_REQUESTER = (import.meta.env.VITE_PROACTIVE_REQUESTER ?? "svc.rpa.bot").toLowerCase();

export function isProactiveTicket(t: Pick<TicketDetail, "requester">): boolean {
  return t.requester.trim().toLowerCase() === PROACTIVE_REQUESTER;
}

export interface ProactiveStats {
  total: number;
  proactive: number;
  reactive: number;
  proactivePct: number;
  reactivePct: number;
}

export function computeProactiveStats(tickets: Pick<TicketDetail, "requester">[]): ProactiveStats {
  const total = tickets.length;
  const proactive = tickets.filter(isProactiveTicket).length;
  const reactive = total - proactive;
  return {
    total,
    proactive,
    reactive,
    proactivePct: total ? Math.round((proactive / total) * 1000) / 10 : 0,
    reactivePct: total ? Math.round((reactive / total) * 1000) / 10 : 0,
  };
}
