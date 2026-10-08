import { http, USE_MOCK } from "../api/httpClient";

export interface CategoryCount {
  label: string;
  count: number;
}

export interface ReviewItem {
  number: string;
  text: string;
  sintoma: string;
  subcategoria: string;
  requester: string;
  assignedTo: string;
  url: string;
}

export interface TicketDetail {
  number: string;
  description: string;
  sintoma: string;
  subcategoria: string;
  resolved: boolean;
  isAutomation: boolean;
  label: string;
  /** Só vem preenchida pra chamados tipo "problema" (único caso com nota de resolução disponível sem chamada nova). Vazia nos demais. */
  resolutionNote: string;
  url: string;
  /** Usados só no export em Excel, não exibidos na tela/modal hoje. */
  requester: string;
  assignedTo: string;
  openedAt: string;
  priority: string;
  origin: string;
}

export interface SlaCompliance {
  evaluated: number;
  percentage: number | null;
}

export interface MttrStats {
  evaluated: number;
  avgMinutes: number | null;
}

export interface OverflowTicket {
  number: string;
  description: string;
  sintoma: string;
  requester: string;
  assignedTo: string;
  openedAt: string;
  url: string;
  /** true = era transbordo e foi resolvido ESTE mês (não está mais em aberto). */
  resolved: boolean;
  closedAt: string;
}

export interface TicketsSummary {
  ticketsThisMonth: number;
  ticketsInProgress: number;
  ticketsOverflow: number;
  overflowTickets: OverflowTicket[];
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
  byOrigin: CategoryCount[];
  byPriority: CategoryCount[];
  needsReview: ReviewItem[];
  tickets: TicketDetail[];
  slaCompliance: SlaCompliance;
  mttr: MttrStats;
}

export interface MonthTrend {
  month: string;
  label: string;
  total: number;
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
}

export interface TicketsTrend {
  months: MonthTrend[];
}

/**
 * Resumo completo de UM mês específico (clique num ponto do gráfico de
 * tendência) - mesmas quebras/listas de TicketsSummary, só que "stillOpen"
 * no lugar de ticketsInProgress/ticketsOverflow: pra mês fechado não existe
 * "em atendimento agora" nem "transbordo" (isso exigiria saber o estado do
 * chamado NUMA DATA PASSADA, que o ServiceNow não guarda) - "stillOpen" é
 * "dos chamados abertos nesse mês, quantos ainda não foram resolvidos até
 * hoje", que é calculável de verdade.
 */
export interface MonthSummary {
  month: string;
  label: string;
  ticketsThisMonth: number;
  /** Transbordo daquele mês, reconstruído por datas de abertura/fechamento: resolved=true → fechou DENTRO do mês; false → seguia aberto no fim dele. */
  ticketsOverflow: number;
  overflowTickets: OverflowTicket[];
  /** Melhorias daquele mês (mesma lógica de resolved). */
  melhorias: Melhoria[];
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

export interface Melhoria {
  number: string;
  description: string;
  state: string;
  requester: string;
  assignedTo: string;
  symptom: string;
  openedAt: string;
  url: string;
  /** true = melhoria resolvida/fechada ESTE mês (fica na lista só pra não sumir sem rastro). */
  resolved: boolean;
  closedAt: string;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function mockTrend(): TicketsTrend {
  const now = new Date();
  const counts = [55, 128, 74, 151, 127, 121];
  return {
    months: counts.map((total, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const padhy = Math.round(total * 0.25);
      const r045 = Math.round(total * 0.12);
      const outros = total - padhy - r045;
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        total,
        byAutomation: [{ label: "R045", count: r045 }],
        byProduct: [
          { label: "PADHY — Solicitação de acesso", count: padhy },
          { label: "Não informada — Não informado", count: outros },
        ],
      };
    }),
  };
}

function mockMelhorias(): Melhoria[] {
  return [
    {
      number: "TASK1480001",
      description:
        "Melhoria solicitada: incluir validação extra no fluxo de aprovação de RC, garantindo que o valor total não ultrapasse o limite configurado por centro de custo antes de liberar a requisição para o próximo aprovador.",
      state: "Aguardando Atendimento",
      requester: "Marcelo Santos Duarte",
      assignedTo: "Fernanda Lima",
      symptom: "RPA",
      openedAt: "2026-09-05 09:12:00",
      url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1480001",
      resolved: false,
      closedAt: "",
    },
    {
      number: "TASK1480002",
      description: "Melhoria: adicionar novo campo obrigatório no formulário de solicitação.",
      state: "Em Atendimento",
      requester: "Lucas Ferreira Gonzaga Santos",
      assignedTo: "Fernanda Lima",
      symptom: "Solicitação de acesso",
      openedAt: "2026-08-28 14:30:00",
      url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1480002",
      resolved: false,
      closedAt: "",
    },
    {
      number: "TASK1443769",
      description: "Melhoria: ajustar validação de devolução de produto no fluxo R001.",
      state: "Resolvido",
      requester: "Diogo Da Silva Brito",
      assignedTo: "Fernanda Lima",
      symptom: "R001 - Devolução de Produto",
      openedAt: "2026-07-22 14:32:00",
      url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1443769",
      resolved: true,
      closedAt: "2026-09-10 16:05:00",
    },
  ];
}

/**
 * Camada unica de acesso ao ServiceNow (chamados das filas Produtos Digitais
 * e Suporte RPA). Em mock, numeros fixos so pra a tela nao ficar vazia -
 * assim que SERVICENOW_MODE=live no backend, isso vira dado real.
 */
export const serviceNowService = {
  async getTicketsSummary(): Promise<TicketsSummary> {
    if (USE_MOCK) {
      return {
        ticketsThisMonth: 47,
        ticketsInProgress: 12,
        ticketsOverflow: 5,
        overflowTickets: [
          {
            number: "TASK1465210",
            description: "Robô R021 apresenta divergência recorrente na conciliação das contas transitórias - aguardando validação do time financeiro.",
            sintoma: "R021 - Conciliações das contas transitórias",
            requester: "Diogo Da Silva Brito",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-08-18 09:40:00",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1465210",
            resolved: false,
            closedAt: "",
          },
          {
            number: "INC0259887",
            description: "Servidor VM-RPA-02 apresentou lentidão intermitente durante execuções noturnas - investigação em andamento com o time de infraestrutura.",
            sintoma: "Erro RPA",
            requester: "Marcelo Santos Duarte",
            assignedTo: "Não atribuído",
            openedAt: "2026-08-22 15:12:00",
            url: "https://suaempresa.service-now.com/incident.do?sys_id=mock-inc0259887",
            resolved: false,
            closedAt: "",
          },
          {
            number: "TASK1443769",
            description: "Melhoria: ajustar validação de devolução de produto no fluxo R001.",
            sintoma: "R001 - Devolução de Produto",
            requester: "Diogo Da Silva Brito",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-07-22 14:32:00",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1443769",
            resolved: true,
            closedAt: "2026-09-10 16:05:00",
          },
        ],
        byAutomation: [
          { label: "R012 - Notas de serviços", count: 6 },
          { label: "R021 - Conciliações das contas transitórias", count: 4 },
          { label: "R045", count: 3 },
        ],
        byProduct: [
          { label: "PADHY — Solicitação de acesso", count: 8 },
          { label: "Desapega — Solicitação de informação", count: 3 },
          { label: "Não informada — Não informado", count: 2 },
        ],
        byOrigin: [
          { label: "Solicitação", count: 34 },
          { label: "Incidente", count: 10 },
          { label: "Problema", count: 3 },
        ],
        byPriority: [
          { label: "2 - Alta", count: 5 },
          { label: "3 - Moderada", count: 38 },
          { label: "4 - Baixa", count: 4 },
        ],
        needsReview: [
          {
            number: "TASK1000003",
            text: "Solicitação gerada através do(a) aplicação Categoria: Infraestrutura Subcategoria: Infraestrutura - Mensageria Sintoma: Análise de Alerta...",
            sintoma: "Não informado",
            subcategoria: "Não informada",
            requester: "Camila Reis",
            assignedTo: "Fernanda Lima",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000003",
          },
          {
            number: "TASK1000004",
            text: "Solicitação gerada através do(a) Portal de Auto-atendimento Categoria: Produtos Digitais Subcategoria: PADHY Sintoma: Outro.",
            sintoma: "Outro",
            subcategoria: "PADHY",
            requester: "Rafael Souza",
            assignedTo: "Não atribuído",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000004",
          },
        ],
        tickets: [
          {
            number: "TASK1000001",
            description: "Robô R012 parou na etapa de emissão de notas de serviço - erro de sessão expirada no sistema fiscal.",
            sintoma: "R012 - Notas de serviços",
            subcategoria: "RPA & Automação",
            resolved: true,
            isAutomation: true,
            label: "R012 - Notas de serviços",
            resolutionNote: "Sessão do sistema fiscal renovada manualmente e execução reprocessada com sucesso.",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000001",
            requester: "Diogo Da Silva Brito",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-09-02 08:15:00",
            priority: "3 - Moderada",
            origin: "Solicitação",
          },
          {
            number: "TASK1000002",
            description: "Robô R012 falhou novamente na mesma etapa após reprocessamento manual.",
            sintoma: "R012 - Notas de serviços",
            subcategoria: "RPA & Automação",
            resolved: false,
            isAutomation: true,
            label: "R012 - Notas de serviços",
            resolutionNote: "",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000002",
            requester: "svc.rpa.bot",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-09-05 11:40:00",
            priority: "2 - Alta",
            origin: "Solicitação",
          },
          {
            number: "PRB0001234",
            description: "Servidor VM-RPA-04 apresentou alto consumo de memória durante a execução do R012, causando timeout.",
            sintoma: "R012 - Notas de serviços",
            subcategoria: "RPA & Automação",
            resolved: true,
            isAutomation: true,
            label: "R012 - Notas de serviços",
            resolutionNote: "Identificado vazamento de memória no processo do Control Room - aplicado patch e reiniciado o serviço no servidor.",
            url: "https://suaempresa.service-now.com/problem.do?sys_id=mock-prb0001234",
            requester: "Marcelo Santos Duarte",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-09-08 16:20:00",
            priority: "1 - Crítica",
            origin: "Problema",
          },
          {
            number: "TASK1000005",
            description: "Usuário solicita liberação de acesso ao portal PADHY para novo colaborador da área fiscal.",
            sintoma: "Solicitação de acesso",
            subcategoria: "PADHY",
            resolved: true,
            isAutomation: false,
            label: "PADHY — Solicitação de acesso",
            resolutionNote: "Acesso concedido ao perfil solicitado e validado junto ao usuário.",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000005",
            requester: "Lucas Ferreira Gonzaga Santos",
            assignedTo: "Fernanda Lima",
            openedAt: "2026-09-10 09:05:00",
            priority: "3 - Moderada",
            origin: "Solicitação",
          },
          {
            number: "TASK1000003",
            description: "Solicitação gerada através do(a) aplicação Categoria: Infraestrutura Subcategoria: Infraestrutura - Mensageria Sintoma: Análise de Alerta...",
            sintoma: "Não informado",
            subcategoria: "Não informada",
            resolved: false,
            isAutomation: false,
            label: "Não informada — Não informado",
            resolutionNote: "",
            url: "https://suaempresa.service-now.com/service_task.do?sys_id=mock-task1000003b",
            requester: "Camila Reis",
            assignedTo: "Não atribuído",
            openedAt: "2026-09-12 14:50:00",
            priority: "3 - Moderada",
            origin: "Incidente",
          },
        ],
        slaCompliance: { evaluated: 38, percentage: 92.1 },
        mttr: { evaluated: 38, avgMinutes: 612 },
      };
    }
    return http.get("/servicenow/tickets/summary");
  },

  async getTicketsTrend(): Promise<TicketsTrend> {
    if (USE_MOCK) return mockTrend();
    return http.get("/servicenow/tickets/trend");
  },

  async getMonthSummary(month: string): Promise<MonthSummary> {
    if (USE_MOCK) {
      // Mock: reaproveita os mesmos chamados de exemplo de getTicketsSummary,
      // so trocando o total pra bater visualmente com o grafico de tendencia mockado.
      const base = await this.getTicketsSummary();
      const trend = mockTrend();
      const total = trend.months.find((m) => m.month === month)?.total ?? base.ticketsThisMonth;
      return {
        month,
        label: trend.months.find((m) => m.month === month)?.label ?? month,
        ticketsThisMonth: total,
        ticketsOverflow: base.overflowTickets.filter((t) => !t.resolved).length,
        overflowTickets: base.overflowTickets,
        melhorias: mockMelhorias(),
        stillOpen: base.tickets.filter((t) => !t.resolved).length,
        byAutomation: base.byAutomation,
        byProduct: base.byProduct,
        byOrigin: base.byOrigin,
        byPriority: base.byPriority,
        needsReview: base.needsReview,
        tickets: base.tickets,
        slaCompliance: base.slaCompliance,
        mttr: base.mttr,
      };
    }
    return http.get(`/servicenow/tickets/summary/${month}`);
  },

  async getMelhorias(): Promise<Melhoria[]> {
    if (USE_MOCK) return mockMelhorias();
    return http.get("/servicenow/melhorias");
  },
};
