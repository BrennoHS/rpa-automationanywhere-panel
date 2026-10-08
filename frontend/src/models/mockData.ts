import type { Robot, RobotRun, RobotRuns, ScheduleEntry } from "../types";
import { MACHINES, DEVELOPERS } from "../constants";

export const ERRORS = [
  "TimeoutException: SAP GUI não respondeu em 60s",
  "ElementNotFound: botão 'Confirmar' ausente",
  "HTTP 503: API ServiceNow indisponível",
  "AuthenticationError: sessão SAP expirada",
  "FileNotFoundException: layout de retorno ausente",
];

/**
 * Execuções de EXEMPLO de um robô (só no modo mock, sem backend) - derivadas
 * da média/falhas do próprio seed, marcadas com simulated=true pra tela
 * avisar que não é histórico real. Modo live usa o histórico do Control Room.
 */
export function buildMockRuns(robot: Robot): RobotRuns {
  const now = Date.now();
  const runs: RobotRun[] = robot.runs.map((ok, i) => {
    const startedMs = now - (i + 1) * 4 * 3600_000;
    const durationMinutes = +(robot.avg * (0.75 + ((i * 7) % 5) * 0.12)).toFixed(2);
    return {
      startedAt: new Date(startedMs).toISOString(),
      endedAt: new Date(startedMs + durationMinutes * 60_000).toISOString(),
      status: ok ? "COMPLETED" : "FAILED",
      outcome: ok ? "success" : "failure",
      durationMinutes,
      machine: robot.machine,
      error: ok ? "" : ERRORS[i % ERRORS.length],
    };
  });
  return { runs, failures: runs.filter((r) => r.outcome === "failure"), simulated: true };
}

// [nome, area, falhas(0..10), ambiente, indiceMaquina, tempoMedio, status]
type SeedRow = {
  id: string;
  name: string;
  area: string;
  environment: string;
  machineIndex: number;
  avg: number;
  status: Robot["status"];
};

const SEED: SeedRow[] = [
  { id: "R001", name: "Devolução de Produtos", area: "ADM Vendas", environment: "Produção", machineIndex: 0, avg: 4.2, status: "Ativo" },
  { id: "R005", name: "FUP de Pedidos", area: "PCI", environment: "Produção", machineIndex: 1, avg: 6.8, status: "Ativo" },
  { id: "R006", name: "Atualização de filas ANVISA", area: "Regulatórios", environment: "Produção", machineIndex: 0, avg: 7.8, status: "Ativo" },
  { id: "R007", name: "Pagamento de Fornecedores", area: "Digital", environment: "Produção", machineIndex: 2, avg: 15.2, status: "Ativo" },
  { id: "R009", name: "Checagem OP em aberto", area: "Controladoria Industrial", environment: "Produção", machineIndex: 1, avg: 9.4, status: "Ativo" },
  { id: "R012", name: "Notas de serviços", area: "Financeiro (Contas a Pagar)", environment: "Produção", machineIndex: 3, avg: 5.5, status: "Ativo" },
  { id: "R013", name: "Desbloqueio de Lotes", area: "Garantia da Qualidade", environment: "Produção", machineIndex: 0, avg: 6.7, status: "Ativo" },
  { id: "R014", name: "Indicadores de OEE", area: "Excelência Operacional", environment: "Produção", machineIndex: 1, avg: 9.1, status: "Ativo" },
  { id: "R018", name: "Tratamento de Divergência em Pedidos SAP", area: "Suprimentos", environment: "Produção", machineIndex: 2, avg: 8.3, status: "Ativo" },
  { id: "R019", name: "Tratamento de Divergência em Pedidos Coupa", area: "Suprimentos", environment: "Produção", machineIndex: 3, avg: 8.9, status: "Ativo" },
  { id: "R020", name: "Reprocessamento de itens de pedido para geração de AR", area: "Suprimentos", environment: "Produção", machineIndex: 0, avg: 11.2, status: "Ativo" },
  { id: "R021", name: "Conciliações das contas transitórias", area: "Financeiro - Tesouraria", environment: "Produção", machineIndex: 1, avg: 12.5, status: "Ativo" },
  { id: "R022", name: "Cobrança Automática", area: "Financeiro - Contas a Receber", environment: "Produção", machineIndex: 2, avg: 6.0, status: "Ativo" },
  { id: "R024", name: "Consolidação dos dados financeiros de projetos - VE", area: "Gestão de Portfólio", environment: "Produção", machineIndex: 3, avg: 10.4, status: "Ativo" },
  { id: "R025", name: "Validação do cadastro das alçadas de aprovação", area: "Controles Internos", environment: "Produção", machineIndex: 0, avg: 7.3, status: "Ativo" },
  { id: "R026", name: "Lançamento de Lacres 5S", area: "Logística Inbound", environment: "Produção", machineIndex: 1, avg: 5.8, status: "Ativo" },
  { id: "R027", name: "-", area: "", environment: "Homologação", machineIndex: 2, avg: 0.0, status: "Pausado" },
  { id: "R028", name: "Arrendamento", area: "Digital", environment: "Produção", machineIndex: 3, avg: 4.6, status: "Ativo" },
  { id: "R030", name: "Gestão de Requisição de Compras", area: "Digital", environment: "Homologação", machineIndex: 0, avg: 6.4, status: "Pausado" },
  { id: "R031", name: "Encerramento de Ordem de Manutenção", area: "Encerramento de Ordens de Manutenção", environment: "Produção", machineIndex: 1, avg: 13.7, status: "Ativo" },
  { id: "R032", name: "Prorrogação de acessos", area: "Digital", environment: "Produção", machineIndex: 2, avg: 3.9, status: "Ativo" },
  { id: "R033", name: "Inteligência Regulatória", area: "Regulatórios", environment: "Produção", machineIndex: 3, avg: 7.1, status: "Ativo" },
  { id: "R034", name: "Integração Interplayers", area: "Martech", environment: "Produção", machineIndex: 0, avg: 3.1, status: "Ativo" },
  { id: "R035", name: "Criação de Ativo Imobilizado", area: "Cadastros", environment: "Produção", machineIndex: 1, avg: 5.2, status: "Ativo" },
  { id: "R037", name: "Atualizar base de usuários do PLM", area: "Excelência Operacional Técnica", environment: "Produção", machineIndex: 2, avg: 8.8, status: "Ativo" },
  { id: "R038", name: "Baixa de EPI", area: "Logística ITA / Almoxarifado não produtivo", environment: "Produção", machineIndex: 3, avg: 4.1, status: "Ativo" },
  { id: "R039", name: "Relatório de Faturamento Sell In Mensal", area: "Digital", environment: "Produção", machineIndex: 0, avg: 9.7, status: "Ativo" },
  { id: "R040", name: "Monitoramento RPA", area: "Digital", environment: "Produção", machineIndex: 1, avg: 2.8, status: "Ativo" },
  { id: "R041", name: "Licitações SalesForce", area: "Digital", environment: "Produção", machineIndex: 2, avg: 4.4, status: "Ativo" },
  { id: "R042", name: "LIVRE", area: "", environment: "Homologação", machineIndex: 3, avg: 0.0, status: "Pausado" },
  { id: "R043", name: "Relatório de Faturamento Sell In Trimestral", area: "Digital", environment: "Produção", machineIndex: 0, avg: 10.1, status: "Ativo" },
  { id: "R044", name: "Inteligência Regulatória - Posições", area: "Regulatórios", environment: "Produção", machineIndex: 1, avg: 7.6, status: "Ativo" },
  { id: "R045", name: "Monitoramento de Importações", area: "Suprimentos", environment: "Homologação", machineIndex: 2, avg: 6.9, status: "Pausado" },
];

export const robotsSeed: Robot[] = SEED.map((r, i) => {
  const fails = r.status === "Ativo" ? [0, 1, 2, 3, 4, 5][i % 6] : 0;
  const runs = Array.from({ length: 10 }, (_, k) => k < 10 - fails);
  return {
    id: r.id,
    name: r.name,
    area: r.area,
    environment: r.environment,
    machine: MACHINES[r.machineIndex],
    developer: DEVELOPERS[i % DEVELOPERS.length],
    status: r.status,
    fails,
    runs,
    avg: r.avg,
    lastExec: `hoje ${String(6 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
    nextExec: `hoje ${String(12 + (i % 10)).padStart(2, "0")}:15`,
    lastError: fails > 0 ? ERRORS[i % ERRORS.length] : "—",
    execToday: 4 + ((i * 3) % 22),
    tickets: fails > 4 ? Math.ceil(fails / 3) : 0,
    slaTarget: 95,
    sla: Math.max(70, 100 - fails * 3),
    minT: +(r.avg * 0.6).toFixed(1),
    maxT: +(r.avg * 1.9).toFixed(1),
    apis: ["SAP", "ServiceNow", "SharePoint"].slice(0, 1 + (i % 3)),
    systems: ["SAP ECC", "Outlook", "Portal Fiscal"].slice(0, 1 + (i % 3)),
    pendencies:
      fails > 3
        ? [
            { id: `p-${i}-1`, text: "API SAP apresenta timeout entre 17h e 18h.", tag: "SAP", prio: "Alta", done: false },
            { id: `p-${i}-2`, text: "Aguardando atualização da API pela equipe de integração.", tag: "Bloqueio", prio: "Média", done: false },
          ]
        : [{ id: `p-${i}-1`, text: "Comportamento validado com a área de negócio.", tag: "Info", prio: "Baixa", done: true }],
  };
});

export const scheduleSeed: ScheduleEntry[] = [
  { id: "s1", machine: "VM-RPA-01", day: 0, start: 24, dur: 8, robot: "R001", process: "Devolução de Produtos", timeout: 60, scheduleType: "DAILY" },
  { id: "s2", machine: "VM-RPA-01", day: 0, start: 28, dur: 6, robot: "R013", process: "Desbloqueio de Lotes", timeout: 45, scheduleType: "WEEKLY" },
  { id: "s3", machine: "VM-RPA-01", day: 1, start: 32, dur: 10, robot: "R006", process: "Atualização de filas ANVISA", timeout: 90, scheduleType: "WEEKLY" },
  { id: "s4", machine: "VM-RPA-01", day: 2, start: 68, dur: 6, robot: "R007", process: "Pagamento de Fornecedores", timeout: 60, scheduleType: "DAILY" },
  { id: "s5", machine: "VM-RPA-01", day: 4, start: 20, dur: 12, robot: "R014", process: "Indicadores de OEE", timeout: 120, scheduleType: "WEEKLY" },
  { id: "s6", machine: "VM-RPA-02", day: 0, start: 36, dur: 8, robot: "R021", process: "Conciliações das contas transitórias", timeout: 60, scheduleType: "DAILY" },
  { id: "s7", machine: "VM-RPA-02", day: 3, start: 40, dur: 14, robot: "R034", process: "Integração Interplayers", timeout: 120, scheduleType: "WEEKLY" },
];
