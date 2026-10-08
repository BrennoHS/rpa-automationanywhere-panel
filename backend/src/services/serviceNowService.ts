import { env } from "../config/env";
import { snCount, snList } from "./serviceNowClient";
import { getFrozenMonth, setFrozenMonth } from "./trendHistoryStore";
import { seedIfEmpty, getNotifiedNumbers, markNotified } from "./serviceNowNotifyStore";
import { notifyNewTicket } from "./teamsServiceNowNotifier";
import { getFrozenMonthSummary, setFrozenMonthSummary } from "./monthSummaryStore";

/**
 * Tabela nativa "task" - a tabela BASE de onde "incident"/"service_task"/
 * "problem" herdam no ServiceNow. Substituiu a tabela de relatorio customizada
 * "u_incident_service_task" que usavamos antes: aquela denormalizava os 3
 * tipos de chamado com prefixos diferentes por origem (req_, inc_, tsk_), o
 * que forcava cada campo (Sintoma, nota de resolucao) a um caminho diferente
 * por tipo - e ate uma chamada extra por tipo pra buscar em tabela separada.
 * Confirmado via curl real (query direto na "task" com os mesmos 2 chamados
 * que ja tinhamos ground-truth de antes, INC0262600 e PRB0042819 - valores
 * bateram exatamente) que a tabela nativa ja traz TUDO junto, com o MESMO
 * nome de campo pras 3 classes, numa unica chamada.
 */
const TABLE = "task";

/** As 3 classes de chamado que passam pelas duas filas monitoradas - confirmado via curl que sys_class_name assume exatamente esses 3 valores. */
const TICKET_CLASSES = ["incident", "service_task", "problem"] as const;

/** sys_id dos assignment_group das filas monitoradas - configurado via SERVICENOW_ASSIGNMENT_GROUPS no .env (ver config/env.ts). */
const ASSIGNMENT_GROUPS = env.serviceNow.assignmentGroups;

/** Estados (u_report_state) considerados encerrados - mesmos codigos do filtro que o time ja usa, revalidados na tabela nativa (closed_at so vem preenchido quando o estado esta nessa lista - conferido em 7 registros reais). */
const CLOSED_STATES = ["11", "8", "7"];

/**
 * Monta a encoded query do ServiceNow: (classe incidente/solicitacao/problema)
 * AND (fila A OU fila B) AND <condicao> - confirmada campo-a-campo contra o
 * filtro real que o proprio time montou na UI classica ("task_list.do") pra
 * ver as 2 filas nos 3 tipos de chamado de uma vez. Sem a checagem de
 * integridade de linha orfa que existia antes (so fazia sentido pra tabela de
 * relatorio, que podia ter linha sem vinculo valido) - aqui e a tabela
 * nativa, todo registro tem sys_id valido por definicao.
 */
function query(condition: string): string {
  const classes = TICKET_CLASSES.map((c) => `sys_class_name=${c}`).join("^OR");
  const groups = ASSIGNMENT_GROUPS.map((id) => `assignment_group=${id}`).join("^OR");
  return `${classes}^${groups}^${condition}`;
}

/**
 * Condicao "aberto esse mes" no campo opened_at, usando o operador ON do
 * ServiceNow com o intervalo relativo padrao (nao uma comparacao de data
 * literal - essa foi a causa do bug inicial: sys_created_on>=... simplesmente
 * nao filtrava nada, contava TODOS os chamados historicos das duas filas).
 * Confirmada campo-a-campo contra a URL real que o time usou no filtro
 * "Aberto(a) em Este mês" do ServiceNow.
 */
const OPENED_THIS_MONTH = "opened_atONThis month@javascript:gs.beginningOfThisMonth()@javascript:gs.endOfThisMonth()";

/** Campo de referencia "Solicitante Tarefa" - confirmado via URL real (filtro aplicado pelo time). Usado no detalhe de Melhorias ("Aberto por"). */
const SOLICITANTE_FIELD = "u_solicitante_tarefa";

/** Campo "Qualificação de Sintoma" - confirmado via URL real (filtro "= Melhoria" aplicado pelo time). */
const QUALIFICACAO_FIELD = "u_qualificacao_sintoma_task";

/**
 * Campo "Sintoma" - existe em DUAS variantes na tabela "task", as duas
 * confirmadas reais via curl direto (incluindo os 2 chamados que ja tinhamos
 * ground-truth de antes: INC0262600="R045" e PRB0042819="Erro RPA", batendo
 * exatamente com o que tinhamos descoberto por outros caminhos antes):
 *  - "u_sintoma_task": texto completo, sem corte.
 *  - "u_sintoma_relatorio": mesma informacao, mas truncada em ~40 caracteres
 *    (visto no TASK1474266: "...Mensa" vs "...Mensageria" completo no _task).
 * Preferimos u_sintoma_task (sem corte); ele as vezes fica vazio em chamado
 * tipo "problema" (PRB0042819: u_sintoma_task="", mas u_sintoma_relatorio=
 * "Erro RPA"), por isso o _relatorio entra como fallback. As duas vem
 * preenchidas pras 3 classes - acabou o problema de "so existe pra um tipo de
 * chamado" que tinhamos com a tabela de relatorio antiga (e o hack de ler a
 * descricao com regex pra cobrir "incidente" nao e mais necessario).
 */
const SINTOMA_TASK_FIELD = "u_sintoma_task";
const SINTOMA_RELATORIO_FIELD = "u_sintoma_relatorio";

/** Campo "Subcategoria" - confirmado preenchido pras 3 classes via curl real na tabela nativa. */
const SUBCATEGORIA_FIELD = "u_subcategoria_relatorio";

/**
 * Robos R001..R052 (faixa informada pelo time - alguns codigos podem nao
 * existir mais, mas isso nao muda o parse: se o texto mencionar, conta).
 * NAO usa \b no final: o nome do robo no texto vem colado com "_" (ex.:
 * "R048_Main_...", "R001_BR_ADMVendas_..."), e "_" conta como caractere de
 * palavra em regex - um \b ali nunca bateria. Usa (?!\d) em vez disso, so pra
 * nao casar "R001" dentro de um numero maior tipo "R0011".
 */
const ROBOT_CODE_PATTERN = /\bR0(0[1-9]|[1-4]\d|5[0-2])(?!\d)/;

/** Campo de descricao - na tabela nativa e so "description" (sem prefixo tsk_). */
const DESCRIPTION_FIELD = "description";
/** Campo do numero do chamado - na tabela nativa e so "number". */
const NUMBER_FIELD = "number";
/** Campo que identifica a origem do chamado ("incident"/"service_task"/"problem") - o VALOR desse campo e tambem o nome do arquivo classico do ServiceNow pro link direto (ex.: "incident" -> incident.do). */
const SYS_CLASS_FIELD = "sys_class_name";
/** sys_id do chamado - junto com SYS_CLASS_FIELD monta o link direto pro chamado no ServiceNow. */
const SYS_ID_FIELD = "sys_id";
/** Campo de estado usado pra decidir "resolvido" - mesmos codigos de CLOSED_STATES, sem prefixo tsk_ na tabela nativa. */
const REPORT_STATE_FIELD = "u_report_state";
/** Campo SLA cumprido - o proprio ServiceNow ja calcula isso ("true"/"false"), nao precisamos comparar datas na mao. */
const MADE_SLA_FIELD = "made_sla";
/** Data de abertura - usada pra agrupar por mes na tendencia de 6 meses. */
const OPENED_AT_FIELD = "opened_at";
/** Quem esta atendendo. */
const ASSIGNED_TO_FIELD = "assigned_to";
/**
 * Nota de resolucao - "close_notes", campo NATIVO da tabela "task" (herdado
 * por incident/service_task/problem), confirmado real via curl nos 3 tipos
 * (chamado fechado de incidente e de solicitacao trouxeram nota completa;
 * problema ainda aberto veio vazio, coerente). Antes precisava de uma
 * chamada extra por classe numa tabela separada pra conseguir isso - agora
 * vem junto na mesma busca, pra qualquer chamado fechado, de qualquer classe.
 */
const RESOLUTION_NOTE_FIELD = "close_notes";
/** Data de fechamento - junto com OPENED_AT_FIELD da o tempo de resolucao (MTTR). */
const CLOSED_AT_FIELD = "closed_at";
/**
 * Prioridade - campo NATIVO do ServiceNow (nao customizado, "priority" sem
 * prefixo u_), escala padrao 1-5 do proprio produto (Critica/Alta/Moderada/
 * Baixa/Planejamento). Ainda nao confirmamos rotulo exato via curl (so vimos
 * "3" nos exemplos reais ate agora) - PRIORITY_LABELS assume a escala padrao
 * do ServiceNow; se algum dia aparecer um rotulo errado na tela, confirma via
 * curl igual fizemos com os outros campos e ajusta aqui.
 */
const PRIORITY_FIELD = "priority";
const PRIORITY_LABELS: Record<string, string> = {
  "1": "1 - Crítica",
  "2": "2 - Alta",
  "3": "3 - Moderada",
  "4": "4 - Baixa",
  "5": "5 - Planejamento",
};

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function firstNonEmpty(values: unknown[], fallback: string): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return fallback;
}

/**
 * Campo de REFERENCIA (aponta pra outro registro, ex.: usuario) - o
 * ServiceNow devolve isso como objeto {value, display_value} (value = sys_id,
 * display_value = nome/texto legivel), nao como string direta, mesmo com
 * sysparm_display_value=true (isso so converte campo de ESCOLHA/choice, tipo
 * "estado", pra string pura - referencia continua objeto). "wantId" pega o
 * sys_id (value) - sem isso, pega o texto legivel (display_value) - usar pra
 * exibir na tela.
 */
function refField(v: unknown, wantId = false): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const id = typeof obj.value === "string" ? obj.value : "";
    const display = typeof obj.display_value === "string" ? obj.display_value : "";
    return wantId ? id || display : display || id;
  }
  return "";
}

type TicketRecord = Partial<
  Record<
    | typeof DESCRIPTION_FIELD
    | typeof NUMBER_FIELD
    | typeof SINTOMA_TASK_FIELD
    | typeof SINTOMA_RELATORIO_FIELD
    | typeof SUBCATEGORIA_FIELD
    | typeof SYS_CLASS_FIELD
    | typeof REPORT_STATE_FIELD
    | typeof MADE_SLA_FIELD
    | typeof RESOLUTION_NOTE_FIELD
    | typeof OPENED_AT_FIELD
    | typeof CLOSED_AT_FIELD
    | typeof PRIORITY_FIELD
    | typeof SOLICITANTE_FIELD
    | typeof ASSIGNED_TO_FIELD
    | typeof SYS_ID_FIELD,
    unknown
  >
>;

/** Numero do chamado. */
function ticketNumber(r: TicketRecord): string {
  return firstNonEmpty([r[NUMBER_FIELD]], "?");
}

/** Chamado "resolvido" = estado dentro dos codigos fechados/cancelados (mesmos de CLOSED_STATES). */
function isResolved(r: TicketRecord): boolean {
  return CLOSED_STATES.includes(asText(r[REPORT_STATE_FIELD]));
}

/** Descricao completa, sem corte - a tela decide como truncar/expandir na exibicao. */
function fullDescription(r: TicketRecord): string {
  return firstNonEmpty([r[DESCRIPTION_FIELD]], "(sem descrição)");
}

/**
 * Link direto pro chamado no ServiceNow, formato classico "<instancia>/<classe>.do?sys_id=<id>"
 * - confirmado real pelos proprios links que o time colou aqui (incident.do,
 * service_task.do, problem.do). Vazio se faltar sys_id ou classe (nunca
 * quebra a tela, so nao mostra o link).
 */
function ticketUrl(r: TicketRecord): string {
  const sysId = asText(r[SYS_ID_FIELD]);
  const sysClass = asText(r[SYS_CLASS_FIELD]);
  if (!sysId || !sysClass) return "";
  return `${env.serviceNow.url}/${sysClass}.do?sys_id=${sysId}`;
}

/** Valor do Sintoma: variante sem corte primeiro, variante "de relatorio" (pode truncar) como fallback, "Não informado" honesto se nenhuma vier preenchida. */
function symptomValue(r: TicketRecord): string {
  return firstNonEmpty([r[SINTOMA_TASK_FIELD], r[SINTOMA_RELATORIO_FIELD]], "Não informado");
}

/** Valor literal do campo Subcategoria. */
function subcategoriaValue(r: TicketRecord): string {
  return firstNonEmpty([r[SUBCATEGORIA_FIELD]], "Não informada");
}

/**
 * Um chamado e de AUTOMACAO se a Subcategoria mencionar "RPA" (cobre tanto
 * "RPA & Automação" quanto so "RPA", os valores reais vistos no dump) OU o
 * Sintoma bater no padrao de robo (R001..R052) - as duas checagens juntas
 * porque nao dependemos de acertar o nome exato de um so campo pra decidir
 * certo.
 */
function isAutomationTicket(subcategoria: string, sintoma: string): boolean {
  return subcategoria.toLowerCase().includes("rpa") || ROBOT_CODE_PATTERN.test(sintoma);
}

/** Valores de Sintoma que nao identificam nada de util (opcao generica do proprio ServiceNow, ou campo ausente). */
const GENERIC_SYMPTOM_VALUES = new Set(["Não informado", "Outro"]);

/**
 * "requester"/"assignedTo" comecam com o sys_id cru (refField com wantId) -
 * a busca principal do mes nao pode usar sysparm_display_value=true (isso
 * converteria REPORT_STATE_FIELD de codigo pra texto e quebraria as
 * comparacoes de SLA/MTTR/resolvido feitas na mesma leva de registros), entao
 * os ids sao resolvidos pra nome DEPOIS, numa chamada pequena e condicional
 * (resolveUserNames) - so entra se realmente existir chamado precisando de
 * revisao.
 */
type ReviewItem = { number: string; text: string; sintoma: string; subcategoria: string; requester: string; assignedTo: string; url: string };

/**
 * Detalhe de um chamado, pro drill-down ao clicar numa barra de
 * "Chamados por automação"/"Chamados por produto": "label" e exatamente o
 * mesmo rotulo que aparece na barra (Sintoma, ou "Subcategoria — Sintoma"),
 * entao o frontend filtra por igualdade de string sem logica nova.
 */
type TicketDetail = {
  number: string;
  description: string;
  sintoma: string;
  subcategoria: string;
  resolved: boolean;
  isAutomation: boolean;
  label: string;
  /** Nota de resolucao (close_notes) - vazia se o chamado ainda nao foi resolvido. */
  resolutionNote: string;
  url: string;
  /** Sys_id cru (resolvido pra nome depois, junto com needsReview/overflowTickets - ver resolveUserNames). So preenchido pro export em Excel, nao usado na tela hoje. */
  requester: string;
  assignedTo: string;
  openedAt: string;
  priority: string;
  origin: string;
};

/**
 * Categoriza os chamados do mes em duas listas separadas - SEM decisao
 * ambigua "qual campo escolher" (essa era a fonte do bug anterior). Em vez
 * disso, mostra os dois campos estruturados juntos:
 *  - Automacao: rotulo e so o Sintoma (ja identifica o robo sozinho -
 *    Subcategoria e sempre "RPA & Automação" ali, nao ajuda a diferenciar).
 *  - Produto: rotulo e "Subcategoria — Sintoma" combinados, porque dois
 *    chamados podem ter a MESMA subcategoria mas sintomas diferentes (ex.:
 *    "PADHY — Solicitação de acesso" vs "PADHY — Solicitação de informação")
 *    e isso importa pra quem for olhar o indicador. Chamados com exatamente
 *    o mesmo par somam juntos.
 * Campo vazio nunca e escondido - aparece como "Não informado(a)" no rotulo,
 * honesto sobre o que faltou preencher no chamado.
 *
 * "needsReview": chamado cujo Sintoma e generico ("Não informado"/"Outro")
 * ou cuja Subcategoria esta vazia - rastreavel (numero + descricao) pra o
 * time conseguir ajustar o cadastro no ServiceNow antes de apresentar o
 * numero pro head, em vez de so sumir dentro de uma media/soma.
 *
 * "includeTickets": monta tambem a lista detalhada de cada chamado (pro
 * drill-down ao clicar numa barra). Fica desligado por padrao porque
 * fetchMonthTrend() chama isso uma vez por MES da tendencia de 6 meses - ligar
 * sempre incharia a resposta com detalhe de chamado que ninguem pediu ali; so
 * o resumo do mes atual (fetchTicketsSummaryLive) liga.
 */
function categorizeRecords(
  records: TicketRecord[],
  includeTickets = false
): {
  byAutomation: CategoryCount[];
  byProduct: CategoryCount[];
  needsReview: ReviewItem[];
  tickets: TicketDetail[];
} {
  const autoCounts = new Map<string, number>();
  const prodCounts = new Map<string, number>();
  const needsReview: ReviewItem[] = [];
  const tickets: TicketDetail[] = [];

  for (const r of records) {
    const sintoma = symptomValue(r);
    const subcategoria = subcategoriaValue(r);
    const isAutomation = isAutomationTicket(subcategoria, sintoma);
    const label = isAutomation ? sintoma : `${subcategoria} — ${sintoma}`;

    if (isAutomation) {
      autoCounts.set(label, (autoCounts.get(label) ?? 0) + 1);
    } else {
      prodCounts.set(label, (prodCounts.get(label) ?? 0) + 1);
    }

    if (GENERIC_SYMPTOM_VALUES.has(sintoma) || subcategoria === "Não informada") {
      needsReview.push({
        number: ticketNumber(r),
        text: fullDescription(r),
        sintoma,
        subcategoria,
        requester: refField(r[SOLICITANTE_FIELD], true),
        assignedTo: refField(r[ASSIGNED_TO_FIELD], true),
        url: ticketUrl(r),
      });
    }

    if (includeTickets) {
      tickets.push({
        number: ticketNumber(r),
        description: fullDescription(r),
        sintoma,
        subcategoria,
        resolved: isResolved(r),
        isAutomation,
        label,
        resolutionNote: asText(r[RESOLUTION_NOTE_FIELD]),
        url: ticketUrl(r),
        requester: refField(r[SOLICITANTE_FIELD], true),
        assignedTo: refField(r[ASSIGNED_TO_FIELD], true),
        openedAt: asText(r[OPENED_AT_FIELD]),
        priority: priorityLabel(asText(r[PRIORITY_FIELD])),
        origin: ORIGIN_LABELS[asText(r[SYS_CLASS_FIELD])] ?? "Não informada",
      });
    }
  }

  const toSorted = (m: Map<string, number>): CategoryCount[] =>
    Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return { byAutomation: toSorted(autoCounts), byProduct: toSorted(prodCounts), needsReview, tickets };
}

type CategoryCount = { label: string; count: number };

/** "evaluated" = quantos chamados fechados do mes tem o dado de SLA pra avaliar; "percentage" honesto (null) se nenhum fechou ainda. */
type SlaCompliance = { evaluated: number; percentage: number | null };

/**
 * % de chamados FECHADOS esse mes que cumpriram o SLA - usa o campo
 * "made_sla" que o proprio ServiceNow ja calcula (comparando contra
 * sla_due), em vez de recalcular data na mao. So avalia quem ja fechou:
 * chamado aberto ainda nao teve seu SLA decidido de verdade.
 */
function computeSlaCompliance(records: TicketRecord[]): SlaCompliance {
  let evaluated = 0;
  let met = 0;
  for (const r of records) {
    if (!isResolved(r)) continue;
    evaluated++;
    if (asText(r[MADE_SLA_FIELD]) === "true") met++;
  }
  return { evaluated, percentage: evaluated > 0 ? Math.round((met / evaluated) * 1000) / 10 : null };
}

/** Rotulo legivel por classe - so as 3 que a query ja filtra, entao sempre bate. */
const ORIGIN_LABELS: Record<string, string> = {
  incident: "Incidente",
  service_task: "Solicitação",
  problem: "Problema",
};

/** Quebra dos chamados do mes por classe de origem (incidente/solicitação/problema) - mesmo campo (sys_class_name) que ja usamos pra decidir Sintoma, so contar. */
function computeOriginBreakdown(records: TicketRecord[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const label = ORIGIN_LABELS[asText(r[SYS_CLASS_FIELD])] ?? "Não informada";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Rotulo de prioridade a partir do codigo cru (1-5) - extraido pra reusar no detalhe de chamado (export) alem da quebra agregada. */
function priorityLabel(code: string): string {
  return PRIORITY_LABELS[code] ?? (code ? `Prioridade ${code}` : "Não informada");
}

/** Quebra dos chamados do mes por prioridade - mesma logica de contagem do resto. */
function computePriorityBreakdown(records: TicketRecord[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const label = priorityLabel(asText(r[PRIORITY_FIELD]));
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** "evaluated" = quantos chamados fechados do mes tem as duas datas pra calcular; "avgMinutes" honesto (null) se nenhum fechou ainda. */
type MttrStats = { evaluated: number; avgMinutes: number | null };

/**
 * Diferenca em minutos entre duas datas do ServiceNow ("2026-09-01 18:33:50").
 * So precisamos da DIFERENCA (nao do instante absoluto), entao nao importa em
 * qual fuso horario o ServiceNow devolve a data - contanto que as duas usem o
 * mesmo (sempre usam, vem do mesmo registro/API). "T" no lugar do espaco so
 * deixa o parse mais previsivel entre engines JS.
 */
function minutesBetween(startStr: string, endStr: string): number | null {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr.replace(" ", "T")).getTime();
  const end = new Date(endStr.replace(" ", "T")).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / 60000;
}

/** MTTR (tempo medio de resolucao) dos chamados FECHADOS esse mes - usa opened_at/closed_at, ja fetched junto com o resto. */
function computeMttr(records: TicketRecord[]): MttrStats {
  let totalMinutes = 0;
  let count = 0;
  for (const r of records) {
    if (!isResolved(r)) continue;
    const minutes = minutesBetween(asText(r[OPENED_AT_FIELD]), asText(r[CLOSED_AT_FIELD]));
    if (minutes === null) continue;
    totalMinutes += minutes;
    count++;
  }
  return { evaluated: count, avgMinutes: count > 0 ? Math.round(totalMinutes / count) : null };
}

/** Detalhe de um chamado transbordo, pro modal ao clicar no card - "aging" (dias em aberto) e calculado no FRONTEND a partir de openedAt, pra nao ficar preso ao instante em que o cache foi montado. */
type OverflowTicket = {
  number: string;
  description: string;
  sintoma: string;
  requester: string;
  assignedTo: string;
  openedAt: string;
  url: string;
  /** true = era transbordo e foi resolvido/fechado ESTE mes (nao esta mais em aberto). */
  resolved: boolean;
  closedAt: string;
};

type TicketsSummary = {
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
};

/**
 * "Transbordo": chamado ainda ABERTO que foi aberto ANTES deste mes - nao foi
 * atendido a tempo, carregou pro mes seguinte. Mesmo operador relativo do
 * ServiceNow usado no resto (gs.beginningOfThisMonth()), so que com "<" em vez
 * de "ON", pra pegar tudo que abriu antes do inicio do mes atual.
 *
 * Alem dos que continuam abertos, traz tambem os que foram RESOLVIDOS neste
 * mes (closed_at >= inicio do mes) - senao um transbordo que fecha some da
 * tela/relatorio sem deixar rastro. "^OR" vale so pra condicao imediatamente
 * anterior (estado), entao vira: abriu antes E (aberto OU fechado neste mes).
 */
const OPENED_BEFORE_THIS_MONTH = `${OPENED_AT_FIELD}<javascript:gs.beginningOfThisMonth()^${REPORT_STATE_FIELD}NOT IN${CLOSED_STATES.join(",")}^OR${CLOSED_AT_FIELD}>=javascript:gs.beginningOfThisMonth()`;
const OVERFLOW_ROW_LIMIT = 200;

/** Campos buscados pra montar um OverflowTicket - mesma lista no mes atual e nos meses passados. */
const OVERFLOW_FIELDS = [
  NUMBER_FIELD,
  DESCRIPTION_FIELD,
  SINTOMA_TASK_FIELD,
  SINTOMA_RELATORIO_FIELD,
  SOLICITANTE_FIELD,
  ASSIGNED_TO_FIELD,
  OPENED_AT_FIELD,
  CLOSED_AT_FIELD,
  REPORT_STATE_FIELD,
  SYS_ID_FIELD,
  SYS_CLASS_FIELD,
];

/** "resolved" vem de fora porque o significado muda: mes atual = fechado ate hoje; mes passado = fechado DENTRO daquele mes. */
function toOverflowTicket(r: TicketRecord, resolved: boolean): OverflowTicket {
  return {
    number: ticketNumber(r),
    description: fullDescription(r),
    sintoma: symptomValue(r),
    requester: refField(r[SOLICITANTE_FIELD], true),
    assignedTo: refField(r[ASSIGNED_TO_FIELD], true),
    openedAt: asText(r[OPENED_AT_FIELD]),
    url: ticketUrl(r),
    resolved,
    closedAt: asText(r[CLOSED_AT_FIELD]),
  };
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** "2026-04" -> "Abr/26" */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

type MonthTrend = { month: string; label: string; total: number; byAutomation: CategoryCount[]; byProduct: CategoryCount[] };

/**
 * Resumo completo de UM mes especifico (atual OU passado) - usado quando
 * alguem clica num ponto do grafico de tendencia pra "entrar" naquele mes.
 * "stillOpen" troca o lugar de "ticketsInProgress" (que so faz sentido pro
 * backlog ATUAL, sem filtro de data - nao existe um "em atendimento de
 * agosto" possivel de calcular, o ServiceNow so devolve estado presente):
 * aqui e "dos chamados abertos NESSE mes, quantos ainda nao foram resolvidos
 * ate hoje" - dado real, so com significado um pouco diferente.
 *
 * "overflowTickets"/"melhorias" de mes passado sao reconstruidos a partir de
 * opened_at/closed_at (o ServiceNow nao guarda o "estado numa data", mas as
 * duas datas dizem se estava aberto): transbordo = aberto ANTES do mes e
 * ainda sem fechar no fim dele (resolved=false) ou fechado DENTRO do mes
 * (resolved=true). ticketsOverflow = so os que seguiam abertos no fim do mes.
 */
type MonthSummary = {
  month: string;
  label: string;
  ticketsThisMonth: number;
  ticketsOverflow: number;
  overflowTickets: OverflowTicket[];
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
};

/** "YYYY-MM" de hoje e dos 5 meses anteriores, do mais antigo pro mais recente (ultimo = mes atual). */
function last6MonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Limite inferior (inclusivo) e superior (exclusivo, = dia 1 do mes seguinte) de um mes "YYYY-MM", no formato de data que o ServiceNow usa ("YYYY-MM-DD HH:mm:ss"). */
function monthBounds(monthKey: string): { start: string; endExclusive: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 00:00:00`;
  return { start: fmt(new Date(y, m - 1, 1)), endExclusive: fmt(new Date(y, m, 1)) };
}

type TicketsTrend = { months: MonthTrend[] };

/**
 * Resolve sys_id -> nome (tabela sys_user) pros poucos chamados que caem em
 * "precisa revisar"/"transbordo" - numa chamada so, batida por sys_id,
 * condicional (so dispara se houver pelo menos 1 id pra resolver), somando
 * os dois grupos numa unica busca. Muta os itens recebidos (ReviewItem e
 * OverflowTicket tem o mesmo formato de campo aqui), trocando o sys_id cru
 * pelo nome (ou "?"/"Não atribuído" se vazio).
 */
async function resolveUserNames(items: { requester: string; assignedTo: string }[]): Promise<void> {
  const ids = Array.from(new Set(items.flatMap((i) => [i.requester, i.assignedTo]).filter(Boolean)));
  if (ids.length === 0) {
    for (const i of items) {
      i.requester = i.requester || "?";
      i.assignedTo = i.assignedTo || "Não atribuído";
    }
    return;
  }

  const rows = await snList<{ sys_id?: unknown; name?: unknown }>("sys_user", `sys_idIN${ids.join(",")}`, ["sys_id", "name"], ids.length);
  const nameById = new Map<string, string>();
  for (const row of rows) {
    const id = asText(row.sys_id);
    const name = asText(row.name);
    if (id && name) nameById.set(id, name);
  }

  for (const i of items) {
    i.requester = nameById.get(i.requester) ?? (i.requester || "?");
    i.assignedTo = nameById.get(i.assignedTo) ?? (i.assignedTo || "Não atribuído");
  }
}

/**
 * Compara os chamados do mes (ja buscados pra tela, zero chamada extra) com
 * o que ja foi notificado antes, e dispara o webhook do Teams (ver
 * teamsServiceNowNotifier.ts - mockado por padrao) pra cada numero de
 * chamado NUNCA visto. Chamada de dentro de fetchTicketsSummaryLive() -
 * mesmo padrao de checkMonitoredFailures() (falha de robo): reage a
 * requisicao HTTP de quem abre/atualiza a tela, sem scheduler/cron proprio
 * (decisao do time, 2026-09-17 - avaliar node-cron depois se a demora entre
 * "chamado abriu" e "alguem abrir o painel" incomodar na pratica).
 */
function checkNewTickets(tickets: TicketDetail[]): void {
  if (tickets.length === 0) return;

  const numbers = tickets.map((t) => t.number);
  if (seedIfEmpty(numbers)) {
    console.log(`[teams-notify-sn] Primeira execucao - ${numbers.length} chamado(s) ja aberto(s) marcado(s) como conhecido(s), sem notificar (evita disparo retroativo de tudo que ja existia).`);
    return;
  }

  const known = getNotifiedNumbers();
  const newTickets = tickets.filter((t) => !known.has(t.number));
  if (newTickets.length === 0) return;

  markNotified(newTickets.map((t) => t.number));
  for (const t of newTickets) {
    notifyNewTicket(t).catch((err) => console.error("[teams-notify-sn] erro inesperado:", err));
  }
}

/**
 * Mesmo padrao de protecao usado no Control Room (getGlobalActivity7d):
 * cache com TTL + single-flight. Sem isso, cada carregamento da tela -
 * de qualquer pessoa do time, a qualquer momento - disparava chamadas novas
 * ao ServiceNow sem nenhuma coordenacao entre elas. Numero de chamados nao
 * muda segundo a segundo, entao um cache de alguns minutos e imperceptivel
 * pro usuario e corta a maior parte da carga repetida.
 */
let ticketsCache: { data: TicketsSummary; expiresAt: number } | null = null;
let ticketsInFlight: Promise<TicketsSummary> | null = null;
const TICKETS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * TRES chamadas ao ServiceNow no total - nenhuma condicional, ao contrario da
 * versao anterior (que ia ate 3 tabelas nativas separadas atras de Sintoma/
 * nota de resolucao). Agora tudo vem junto na tabela "task":
 *  1. snList "chamados do mes" - Table API, ja traz o CONTEUDO (descricao,
 *     Sintoma, Subcategoria, nota de resolucao, prioridade, datas), entao
 *     serve pra contar, categorizar E calcular SLA/MTTR/origem/prioridade -
 *     nao precisa de chamada a mais pra nada disso.
 *  2. snCount "em atendimento" - Stats API, so a contagem (sem limite de
 *     data, reflete o backlog real) - esse numero nao precisa de conteudo,
 *     entao continua na forma mais leve possivel.
 *  3. snList "transbordo" - Table API, quem ainda esta aberto E foi aberto
 *     antes deste mes - precisa do CONTEUDO (nao so contagem) pro modal de
 *     detalhe ao clicar no card, entao ja busca a lista direto.
 */
async function fetchTicketsSummaryLive(): Promise<TicketsSummary> {
  const [thisMonthRecords, ticketsInProgress, overflowRecords] = await Promise.all([
    snList<TicketRecord>(
      TABLE,
      query(OPENED_THIS_MONTH),
      [
        NUMBER_FIELD,
        DESCRIPTION_FIELD,
        SINTOMA_TASK_FIELD,
        SINTOMA_RELATORIO_FIELD,
        SUBCATEGORIA_FIELD,
        SYS_CLASS_FIELD,
        REPORT_STATE_FIELD,
        MADE_SLA_FIELD,
        RESOLUTION_NOTE_FIELD,
        OPENED_AT_FIELD,
        CLOSED_AT_FIELD,
        PRIORITY_FIELD,
        SOLICITANTE_FIELD,
        ASSIGNED_TO_FIELD,
        SYS_ID_FIELD,
      ],
      500
    ),
    snCount(TABLE, query(`${REPORT_STATE_FIELD}NOT IN${CLOSED_STATES.join(",")}`)),
    snList<TicketRecord>(TABLE, query(OPENED_BEFORE_THIS_MONTH), OVERFLOW_FIELDS, OVERFLOW_ROW_LIMIT),
  ]);

  // Sem sysparm_display_value=true aqui de proposito: esse parametro tambem
  // converte campo de DATA pro formato de exibicao do ServiceNow (diferente
  // do formato bruto "YYYY-MM-DD HH:mm:ss" que openedAt precisa pro calculo
  // de aging no frontend) - por isso requester/assignedTo ficam com o sys_id
  // cru aqui, resolvidos pra nome depois (resolveUserNames), junto com os de
  // needsReview, numa unica chamada extra.
  const overflowTickets: OverflowTicket[] = overflowRecords.map((r) => toOverflowTicket(r, isResolved(r)));

  const { byAutomation, byProduct, needsReview, tickets } = categorizeRecords(thisMonthRecords, true);
  await resolveUserNames([...needsReview, ...overflowTickets, ...tickets]);
  checkNewTickets(tickets);
  return {
    ticketsThisMonth: thisMonthRecords.length,
    ticketsInProgress,
    // Card "Chamados transbordo" = so os que CONTINUAM abertos (mesmo
    // significado de sempre); os resolvidos neste mes vem em overflowTickets
    // com resolved=true, pro modal/relatorio mostrarem separado.
    ticketsOverflow: overflowTickets.filter((t) => !t.resolved).length,
    overflowTickets,
    byAutomation,
    byProduct,
    byOrigin: computeOriginBreakdown(thisMonthRecords),
    byPriority: computePriorityBreakdown(thisMonthRecords),
    needsReview,
    tickets,
    slaCompliance: computeSlaCompliance(thisMonthRecords),
    mttr: computeMttr(thisMonthRecords),
  };
}

/**
 * Cache proprio (2h, bem mais longo que o de "chamados do mes") - cobre o
 * resultado JA COMPOSTO dos 6 meses (5 congelados + 1 ao vivo), entao mesmo
 * a parte ao vivo (mes atual) so bate no ServiceNow no maximo a cada 2h.
 */
let trendCache: { data: TicketsTrend; expiresAt: number } | null = null;
let trendInFlight: Promise<TicketsTrend> | null = null;
const TREND_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
/** Teto por MES individual (nao mais pros 6 meses juntos) - mesma folga usada em "chamados do mes" (real ~40-50/mes). */
const MONTH_TREND_ROW_LIMIT = 500;

/** Busca e categoriza UM mes especifico (bem mais barato que buscar os 6 juntos - real ~100-150 registros/mes, nao ~700). */
async function fetchMonthTrend(monthKey: string): Promise<MonthTrend> {
  const { start, endExclusive } = monthBounds(monthKey);
  const condition = `${OPENED_AT_FIELD}>=${start}^${OPENED_AT_FIELD}<${endExclusive}`;
  const records = await snList<TicketRecord>(
    TABLE,
    query(condition),
    [NUMBER_FIELD, SINTOMA_TASK_FIELD, SINTOMA_RELATORIO_FIELD, SUBCATEGORIA_FIELD],
    MONTH_TREND_ROW_LIMIT
  );
  const { byAutomation, byProduct } = categorizeRecords(records);
  return { month: monthKey, label: monthLabel(monthKey), total: records.length, byAutomation, byProduct };
}

/**
 * 6 meses = 5 meses PASSADOS (le do arquivo se ja congelado; se nao, busca
 * ao vivo UMA vez e congela pra sempre - mes fechado nunca muda) + 1 mes
 * ATUAL (sempre ao vivo, nunca congela, ainda esta enchendo). Isso troca
 * "1 busca cara de ~700 chamados toda vez" por "5 leituras de arquivo
 * (gratis) + 1 busca barata de ~40-50 chamados", na pratica so paga o preco
 * de buscar um mes fechado UMA VEZ NA VIDA dele (normalmente a primeira
 * pessoa a abrir a tela depois que o mes vira).
 */
async function fetchTicketsTrendLive(): Promise<TicketsTrend> {
  const monthKeys = last6MonthKeys();
  const currentMonthKey = monthKeys[monthKeys.length - 1];

  const months = await Promise.all(
    monthKeys.map(async (key): Promise<MonthTrend> => {
      if (key === currentMonthKey) {
        return fetchMonthTrend(key);
      }
      const frozen = getFrozenMonth(key);
      if (frozen) return frozen;
      const data = await fetchMonthTrend(key);
      setFrozenMonth(data);
      return data;
    })
  );

  return { months };
}

/**
 * Busca o resumo COMPLETO de um mes FECHADO especifico - mesmo campo-a-campo
 * de fetchTicketsSummaryLive() (nao o recorte minimo de fetchMonthTrend),
 * porque aqui precisa dar pra mostrar/exportar o mes inteiro como se fosse o
 * mes corrente (quebras, chamados pra revisar, lista completa). So chamada
 * na PRIMEIRA vez que alguem clica nesse mes (ver fetchMonthSummary) -
 * depois disso fica congelado pra sempre.
 */
async function fetchMonthSummaryLive(monthKey: string): Promise<MonthSummary> {
  const { start, endExclusive } = monthBounds(monthKey);
  const condition = `${OPENED_AT_FIELD}>=${start}^${OPENED_AT_FIELD}<${endExclusive}`;
  const records = await snList<TicketRecord>(
    TABLE,
    query(condition),
    [
      NUMBER_FIELD,
      DESCRIPTION_FIELD,
      SINTOMA_TASK_FIELD,
      SINTOMA_RELATORIO_FIELD,
      SUBCATEGORIA_FIELD,
      SYS_CLASS_FIELD,
      REPORT_STATE_FIELD,
      MADE_SLA_FIELD,
      RESOLUTION_NOTE_FIELD,
      OPENED_AT_FIELD,
      CLOSED_AT_FIELD,
      PRIORITY_FIELD,
      SOLICITANTE_FIELD,
      ASSIGNED_TO_FIELD,
      SYS_ID_FIELD,
    ],
    MONTH_TREND_ROW_LIMIT
  );

  const { byAutomation, byProduct, needsReview, tickets } = categorizeRecords(records, true);
  await resolveUserNames([...needsReview, ...tickets]);
  const carried = await fetchMonthCarried(monthKey);

  return {
    month: monthKey,
    label: monthLabel(monthKey),
    ticketsThisMonth: records.length,
    ...carried,
    stillOpen: tickets.filter((t) => !t.resolved).length,
    byAutomation,
    byProduct,
    byOrigin: computeOriginBreakdown(records),
    byPriority: computePriorityBreakdown(records),
    needsReview,
    tickets,
    slaCompliance: computeSlaCompliance(records),
    mttr: computeMttr(records),
  };
}

/**
 * Mes ATUAL: delega pra getTicketsSummary() (reusa o MESMO cache de 5min,
 * sem bater no ServiceNow de novo so por causa do clique no grafico) e
 * reformata pro formato de MonthSummary. Mes PASSADO: le do congelado, ou
 * busca ao vivo uma unica vez e congela.
 */
async function fetchMonthSummary(monthKey: string): Promise<MonthSummary> {
  const currentMonthKey = last6MonthKeys()[5];
  if (monthKey === currentMonthKey) {
    const [live, melhorias] = await Promise.all([serviceNowService.getTicketsSummary(), serviceNowService.getMelhorias()]);
    return {
      month: monthKey,
      label: monthLabel(monthKey),
      ticketsThisMonth: live.ticketsThisMonth,
      ticketsOverflow: live.ticketsOverflow,
      overflowTickets: live.overflowTickets,
      melhorias,
      stillOpen: live.tickets.filter((t) => !t.resolved).length,
      byAutomation: live.byAutomation,
      byProduct: live.byProduct,
      byOrigin: live.byOrigin,
      byPriority: live.byPriority,
      needsReview: live.needsReview,
      tickets: live.tickets,
      slaCompliance: live.slaCompliance,
      mttr: live.mttr,
    };
  }

  const frozen = getFrozenMonthSummary(monthKey);
  if (frozen) {
    // Mes congelado ANTES de existir transbordo/melhorias por mes: completa so
    // essa parte (4 buscas pequenas, uma vez) e regrava - o resto do resumo
    // do mes fechado nao muda, nao precisa buscar de novo.
    const { overflowTickets, melhorias } = frozen;
    if (overflowTickets && melhorias) return { ...frozen, overflowTickets, melhorias, ticketsOverflow: frozen.ticketsOverflow ?? 0 };
    const upgraded: MonthSummary = { ...frozen, ...(await fetchMonthCarried(monthKey)) };
    setFrozenMonthSummary(upgraded);
    return upgraded;
  }

  const data = await fetchMonthSummaryLive(monthKey);
  setFrozenMonthSummary(data);
  return data;
}

function mockTicketsTrend(): TicketsTrend {
  const now = new Date();
  const counts = [55, 128, 74, 151, 127, 121];
  const months: MonthTrend[] = counts.map((total, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const padhy = Math.round(total * 0.25);
    const r045 = Math.round(total * 0.12);
    const outros = total - padhy - r045;
    return {
      month,
      label: monthLabel(month),
      total,
      byAutomation: [{ label: "R045", count: r045 }],
      byProduct: [
        { label: "PADHY — Solicitação de acesso", count: padhy },
        { label: "Não informada — Não informado", count: outros },
      ],
    };
  });
  return { months };
}

/** Mock de um mes especifico - reusa os mesmos chamados de exemplo de mockTicketsSummary(), so variando o total pra bater visualmente com o grafico de tendencia mockado (mesmos numeros de mockTicketsTrend). */
function mockMonthSummary(monthKey: string): MonthSummary {
  const keys = last6MonthKeys();
  const idx = keys.indexOf(monthKey);
  const counts = [55, 128, 74, 151, 127, 121];
  const base = mockTicketsSummary();
  return {
    month: monthKey,
    label: monthLabel(monthKey),
    ticketsThisMonth: idx >= 0 ? counts[idx] : base.ticketsThisMonth,
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

type Melhoria = {
  number: string;
  description: string;
  state: string;
  requester: string;
  assignedTo: string;
  symptom: string;
  openedAt: string;
  url: string;
  /** true = melhoria resolvida/fechada ESTE mes (aparece na lista so pra nao sumir sem rastro). */
  resolved: boolean;
  closedAt: string;
};

/**
 * Cache proprio, 10min - "melhorias" e uma lista de chamados em aberto (sem
 * limite de data, igual "em atendimento"), entao muda mais devagar que um
 * numero batido segundo a segundo mas mais rapido que a janela de 6 meses
 * (que tem mes ja fechado, imutavel).
 */
let melhoriasCache: { data: Melhoria[]; expiresAt: number } | null = null;
let melhoriasInFlight: Promise<Melhoria[]> | null = null;
const MELHORIAS_CACHE_TTL_MS = 10 * 60 * 1000;
const MELHORIAS_ROW_LIMIT = 200;

const MELHORIA_FIELDS = [
  NUMBER_FIELD,
  DESCRIPTION_FIELD,
  REPORT_STATE_FIELD,
  OPENED_AT_FIELD,
  CLOSED_AT_FIELD,
  SOLICITANTE_FIELD,
  ASSIGNED_TO_FIELD,
  SINTOMA_TASK_FIELD,
  SINTOMA_RELATORIO_FIELD,
  SYS_ID_FIELD,
  SYS_CLASS_FIELD,
];

/** "resolved" e "state" vem de fora quando o significado muda (mes passado) - ver fetchMonthCarried. */
function toMelhoria(r: TicketRecord, resolved: boolean, stateOverride?: string): Melhoria {
  return {
    number: ticketNumber(r),
    description: fullDescription(r),
    state: stateOverride ?? firstNonEmpty([r[REPORT_STATE_FIELD]], "?"),
    requester: refField(r[SOLICITANTE_FIELD]) || "?",
    assignedTo: refField(r[ASSIGNED_TO_FIELD]) || "Não atribuído",
    symptom: symptomValue(r),
    openedAt: asText(r[OPENED_AT_FIELD]),
    url: ticketUrl(r),
    resolved,
    closedAt: asText(r[CLOSED_AT_FIELD]),
  };
}

/** Em aberto primeiro, resolvidos no fim (sort estavel - mantem a ordem original dentro de cada grupo). */
function openFirst<T extends { resolved: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(a.resolved) - Number(b.resolved));
}

/**
 * Chamados com Qualificação de Sintoma = "Melhoria", em aberto (nao fechado/
 * cancelado), sem limite de data - podem ser transbordo de mes anterior - MAIS
 * os que foram resolvidos ESTE mes (closed_at >= inicio do mes), senao uma
 * melhoria que fecha some da tela/relatorio sem rastro. "^OR" vale so pra
 * condicao anterior (estado): Melhoria E (aberto OU fechado neste mes). Usa
 * sysparm_display_value=true pra "estado"/"solicitante"/"quem atende" virem
 * como texto legivel (nome/label) em vez de sys_id/codigo cru - so pra essa
 * chamada, nao afeta getTicketsSummary/getTicketsTrend. Por isso "resolved"
 * vem de closed_at preenchido (so vem preenchido em estado fechado), nao do
 * codigo do estado (que aqui vira texto).
 */
async function fetchMelhoriasLive(): Promise<Melhoria[]> {
  const condition = `${QUALIFICACAO_FIELD}=Melhoria^${REPORT_STATE_FIELD}NOT IN${CLOSED_STATES.join(",")}^OR${CLOSED_AT_FIELD}>=javascript:gs.beginningOfThisMonth()`;
  const records = await snList<TicketRecord>(TABLE, query(condition), MELHORIA_FIELDS, MELHORIAS_ROW_LIMIT, true);
  return openFirst(records.map((r) => toMelhoria(r, asText(r[CLOSED_AT_FIELD]).length > 0)));
}

/**
 * Transbordo e melhorias de um mes PASSADO, reconstruidos por opened_at/
 * closed_at (ver MonthSummary). Quatro buscas pequenas, em paralelo, UMA vez
 * na vida de cada mes (o resultado congela junto com o resumo do mes):
 *  - transbordo resolvido no mes: abriu antes do mes E fechou dentro dele.
 *  - transbordo aberto no fim do mes: abriu antes E (sem fechar OU fechou depois do mes).
 *  - melhoria resolvida no mes / aberta no fim do mes: mesma logica, mas
 *    "abriu antes do FIM do mes" (melhoria aberta dentro do proprio mes conta).
 * Datas comparadas no servidor (mesmos limites de monthBounds usados no resto),
 * nao no JS - evita erro de fuso nas bordas do mes.
 */
async function fetchMonthCarried(monthKey: string): Promise<{ ticketsOverflow: number; overflowTickets: OverflowTicket[]; melhorias: Melhoria[] }> {
  const { start, endExclusive } = monthBounds(monthKey);
  const [ovResolved, ovOpen, melResolved, melOpen] = await Promise.all([
    snList<TicketRecord>(TABLE, query(`${OPENED_AT_FIELD}<${start}^${CLOSED_AT_FIELD}>=${start}^${CLOSED_AT_FIELD}<${endExclusive}`), OVERFLOW_FIELDS, OVERFLOW_ROW_LIMIT),
    snList<TicketRecord>(TABLE, query(`${OPENED_AT_FIELD}<${start}^${CLOSED_AT_FIELD}ISEMPTY^OR${CLOSED_AT_FIELD}>=${endExclusive}`), OVERFLOW_FIELDS, OVERFLOW_ROW_LIMIT),
    snList<TicketRecord>(TABLE, query(`${QUALIFICACAO_FIELD}=Melhoria^${OPENED_AT_FIELD}<${endExclusive}^${CLOSED_AT_FIELD}>=${start}^${CLOSED_AT_FIELD}<${endExclusive}`), MELHORIA_FIELDS, MELHORIAS_ROW_LIMIT, true),
    snList<TicketRecord>(TABLE, query(`${QUALIFICACAO_FIELD}=Melhoria^${OPENED_AT_FIELD}<${endExclusive}^${CLOSED_AT_FIELD}ISEMPTY^OR${CLOSED_AT_FIELD}>=${endExclusive}`), MELHORIA_FIELDS, MELHORIAS_ROW_LIMIT, true),
  ]);

  const overflowTickets = openFirst([...ovOpen.map((r) => toOverflowTicket(r, false)), ...ovResolved.map((r) => toOverflowTicket(r, true))]);
  await resolveUserNames(overflowTickets);

  // Estado ATUAL do chamado pode ja ser "Resolvido" (fechou depois do mes) - pra
  // uma melhoria "aberta no fim do mes" isso confundiria, entao rotula pelo que era naquela data.
  const melhorias = openFirst([
    ...melOpen.map((r) => toMelhoria(r, false, asText(r[CLOSED_AT_FIELD]).length > 0 ? "Aberta no fim do mês" : undefined)),
    ...melResolved.map((r) => toMelhoria(r, true)),
  ]);

  return { ticketsOverflow: ovOpen.length, overflowTickets, melhorias };
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

/** Mock plausivel pra tela nao ficar vazia enquanto SERVICENOW_MODE=mock. */
function mockTicketsSummary(): TicketsSummary {
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
        requester: "Diogo Da Silva Brito",
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

export const serviceNowService = {
  /**
   * Numeros pra tela de ServiceNow: total de chamados abertos ESSE MES nas
   * duas filas (qualquer estado), quantos estao EM ANDAMENTO agora (nao
   * fechado/cancelado, sem limite de data - reflete o backlog real), e a
   * quebra em duas listas separadas - automacao (rotulo = Sintoma) e produto
   * (rotulo = "Subcategoria — Sintoma") - sem escolher um campo so, honesto
   * sobre campo vazio ("Não informado(a)" em vez de esconder).
   */
  async getTicketsSummary(): Promise<TicketsSummary> {
    if (env.serviceNow.mode === "mock") {
      return mockTicketsSummary();
    }

    if (ticketsCache && Date.now() < ticketsCache.expiresAt) {
      return ticketsCache.data;
    }
    if (ticketsInFlight) return ticketsInFlight;

    ticketsInFlight = fetchTicketsSummaryLive()
      .then((data) => {
        ticketsCache = { data, expiresAt: Date.now() + TICKETS_CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        ticketsInFlight = null;
      });
    return ticketsInFlight;
  },

  /**
   * Chamados por mes, ultimos 6 meses, com a mesma quebra automacao/produto
   * de getTicketsSummary dentro de cada mes - da pra filtrar no frontend por
   * um rotulo especifico (ex.: so "R045") sem chamada nova, ja que a quebra
   * de cada mes ja vem pronta.
   */
  async getTicketsTrend(): Promise<TicketsTrend> {
    if (env.serviceNow.mode === "mock") {
      return mockTicketsTrend();
    }

    if (trendCache && Date.now() < trendCache.expiresAt) {
      return trendCache.data;
    }
    if (trendInFlight) return trendInFlight;

    trendInFlight = fetchTicketsTrendLive()
      .then((data) => {
        trendCache = { data, expiresAt: Date.now() + TREND_CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        trendInFlight = null;
      });
    return trendInFlight;
  },

  /**
   * Resumo completo de UM mes especifico - acionado quando alguem clica num
   * ponto do grafico de tendencia pra "entrar" naquele mes. Mes atual reusa
   * o cache de getTicketsSummary(); mes passado fica congelado pra sempre
   * depois da primeira busca (ver monthSummaryStore.ts).
   */
  async getMonthSummary(monthKey: string): Promise<MonthSummary> {
    if (env.serviceNow.mode === "mock") {
      return mockMonthSummary(monthKey);
    }
    return fetchMonthSummary(monthKey);
  },

  /**
   * Chamados de melhoria em aberto (Qualificação de Sintoma = "Melhoria"),
   * com detalhe breve de cada um - pra dar visibilidade num dash apresentado
   * pro head, sem virar uma copia do ServiceNow.
   */
  async getMelhorias(): Promise<Melhoria[]> {
    if (env.serviceNow.mode === "mock") {
      return mockMelhorias();
    }

    if (melhoriasCache && Date.now() < melhoriasCache.expiresAt) {
      return melhoriasCache.data;
    }
    if (melhoriasInFlight) return melhoriasInFlight;

    melhoriasInFlight = fetchMelhoriasLive()
      .then((data) => {
        melhoriasCache = { data, expiresAt: Date.now() + MELHORIAS_CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        melhoriasInFlight = null;
      });
    return melhoriasInFlight;
  },
};
