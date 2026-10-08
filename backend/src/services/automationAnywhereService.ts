import fs from "fs";
import path from "path";
import { logCache } from "./callLog";
import { FailureLog, FailureLogEntry, Robot, RobotRun, RobotRuns, ScheduleEntry } from "../types";
import { env } from "../config/env";
import { makeRobotRepository } from "../repositories";
import { crPost, crPostAll } from "./controlRoomClient";
import { getMonitoredIds, getLastNotifiedFailureAt, isMonitored, setLastNotifiedFailureAt, setMonitored } from "./monitoringStore";
import { notifyFailure } from "./teamsNotifier";

const repo = makeRobotRepository();

/** Injeta o estado de monitoramento (persistido a parte) num Robot ja montado. */
function withMonitored(r: Robot): Robot {
  return { ...r, monitored: isMonitored(r.id) };
}

/** Ultimas N execucoes (dentro da janela de 7 dias) usadas para status/health de cada robo. */
const RUN_HISTORY_LENGTH = 10;

/** dia da semana da Automation Anywhere -> indice usado no ScheduleEntry (0 = Segunda ... 6 = Domingo) */
const WEEKDAY_INDEX: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};
const ALL_WEEKDAYS = Object.keys(WEEKDAY_INDEX);

interface Device {
  id: string;
  hostName: string;
  nickname: string;
  status: string;
  poolName: string;
  defaultUsers: { id: string; username: string }[];
}

interface Activity {
  fileId: string;
  fileName: string;
  status: string;
  startDateTime: string;
  endDateTime: string;
  deviceName: string;
  userName: string;
  /**
   * "error.message" NUNCA vem preenchido no registro real (confirmado via
   * "[run-debug]", 2026-09-21 - vem sempre "", mesmo em falha real) - a
   * mensagem de verdade fica no campo "message" de nivel raiz do registro.
   * "error" mantido no tipo (fallback abaixo em errorMessage()) caso algum
   * outro tipo de falha preencha ele e nao o "message" raiz.
   */
  message?: string;
  error?: { message?: string; details?: string };
  type?: string;
  initiationType?: string;
  automationName?: string;
  currentBotName?: string;
  currentLine?: number;
  totalLines?: number;
}

/** Mensagem de erro de uma execucao - "message" raiz primeiro (onde ela realmente vem), com fallback pro "error" aninhado. */
function errorMessage(a: Activity): string {
  return (a.message || a.error?.message || a.error?.details || "").trim();
}

interface AutomationSchedule {
  id: string;
  activityName: string;
  scheduleType: "DAILY" | "WEEKLY" | string;
  dailyRecurrence?: { interval: number };
  weeklyRecurrence?: { interval: number; daysOfWeek: string[] };
  startTime: string; // "HH:MM"
  fileId: string;
  fileName: string;
  runAsUserIds: string[];
  status: "ACTIVE" | "INACTIVE" | string;
}

/**
 * Endpoint confirmado: POST /v2/devices/list. Em cache por 5min (mesmo TTL
 * de getSchedules) + single-flight - antes era a UNICA das buscas do Control
 * Room sem nenhum cache, batendo de novo a cada `getSchedule()` (2026-09-21:
 * log de diagnostico apareceu 2x pra um so carregamento da tela do Schedule,
 * sinal de 2 chamadas concorrentes sem essa protecao).
 */
let devicesCache: { data: Device[]; expiresAt: number } | null = null;
let devicesInFlight: Promise<Device[]> | null = null;
const DEVICES_CACHE_TTL_MS = 5 * 60 * 1000;

/** true depois do 1o log de "[schedule-debug]" nesse processo - ver getSchedule(). */
let scheduleDebugLogged = false;

async function listDevices(): Promise<Device[]> {
  if (devicesCache && Date.now() < devicesCache.expiresAt) {
    logCache("devices", "HIT");
    return devicesCache.data;
  }
  if (devicesInFlight) {
    logCache("devices", "JOIN");
    return devicesInFlight;
  }
  logCache("devices", "MISS");
  devicesInFlight = crPostAll<Device>("/v2/devices/list", {})
    .then((data) => {
      devicesCache = { data, expiresAt: Date.now() + DEVICES_CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      devicesInFlight = null;
    });
  return devicesInFlight;
}

/**
 * Endpoint confirmado: POST /v2/schedule/automations/list. Em cache por 5min
 * e usado por TODOS os consumidores (listRobots, getRobot, getSchedule,
 * getScheduleSummary) - a busca em si (paginada, sequencial) so roda uma vez
 * a cada 5 minutos, nao uma vez por chamada.
 *
 * "scheduleInFlight" evita que duas requisicoes que chegam quase juntas (ex.:
 * o Dashboard carrega robos e resumo de agendamento ao mesmo tempo) vejam o
 * cache vazio e disparem DUAS buscas em paralelo - quem chega depois espera
 * o resultado da busca que ja esta em andamento, em vez de iniciar outra.
 */
let scheduleCache: { data: AutomationSchedule[]; expiresAt: number } | null = null;
let scheduleInFlight: Promise<AutomationSchedule[]> | null = null;
const SCHEDULE_CACHE_TTL_MS = 5 * 60 * 1000;

async function getSchedules(): Promise<AutomationSchedule[]> {
  if (scheduleCache && Date.now() < scheduleCache.expiresAt) {
    logCache("schedules", "HIT");
    return scheduleCache.data;
  }
  if (scheduleInFlight) {
    logCache("schedules", "JOIN");
    return scheduleInFlight;
  }
  logCache("schedules", "MISS");
  scheduleInFlight = crPostAll<AutomationSchedule>("/v2/schedule/automations/list", {})
    .then((data) => {
      scheduleCache = { data, expiresAt: Date.now() + SCHEDULE_CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      scheduleInFlight = null;
    });
  return scheduleInFlight;
}

/**
 * 7 dias de historico global cabem em bem menos que o teto original - com a
 * interface do Control Room confirmando o volume real, 10 paginas de 200
 * (2000 registros) e suficiente e mais leve que a salvaguarda anterior de
 * 30x500 (15000).
 */
const GLOBAL_PAGE_SIZE = 200;
const GLOBAL_MAX_PAGES = 10;

/**
 * Busca TODAS as execucoes do Control Room INTEIRO (sem filtro de bot) desde
 * um instante ate agora, paginando SEQUENCIALMENTE (uma pagina de cada vez,
 * nunca em paralelo) ate encontrar um registro mais antigo que o corte.
 */
async function listGlobalActivitySince(sinceMs: number): Promise<Activity[]> {
  if (env.controlRoom.activityServerFilter) {
    try {
      return await readActivityPages(sinceMs, true);
    } catch (err) {
      // filtro recusado pelo Control Room (HTTP 4xx, ex.: campo/formato de data
      // nao aceito) - cai no caminho antigo em vez de deixar o painel sem dado.
      // Erro de rede/timeout/5xx NAO cai aqui de proposito (nao adianta tentar
      // de novo mais pesado num Control Room que ja esta com problema).
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message)) {
        console.warn(`[activity] filtro de data recusado pelo Control Room (${err.message.slice(0, 160)}) - usando a busca sem filtro.`);
        return readActivityPages(sinceMs, false);
      }
      throw err;
    }
  }
  return readActivityPages(sinceMs, false);
}

async function readActivityPages(sinceMs: number, serverFilter: boolean): Promise<Activity[]> {
  const since = new Date(sinceMs);
  const all: Activity[] = [];
  let offset = 0;
  let complete = false;
  let knownTotal: number | null = null;

  for (let page = 0; page < GLOBAL_MAX_PAGES; page++) {
    const resp = await crPost<Activity>("/v3/activity/list", {
      ...(serverFilter ? { filter: { operator: "ge", field: "startDateTime", value: since.toISOString() } as const } : {}),
      sort: [{ field: "startDateTime", direction: "desc" }],
      page: { offset, length: GLOBAL_PAGE_SIZE },
    });
    if (serverFilter && knownTotal == null) knownTotal = resp.page?.totalFilter ?? null;
    if (resp.list.length === 0) {
      complete = true;
      break;
    }

    for (const r of resp.list) {
      // com filtro no servidor isso nao deveria acontecer - fica como garantia
      if (new Date(r.startDateTime) < since) {
        return all;
      }
      all.push(r);
    }

    offset += resp.list.length;
    if (resp.list.length < GLOBAL_PAGE_SIZE || (knownTotal != null && offset >= knownTotal)) {
      complete = true;
      break;
    }
  }

  // bateu no teto de paginas sem chegar no fim/corte de 7 dias: os dias mais
  // antigos da janela ficam incompletos (contagens/graficos subestimados) -
  // nao da pra so aumentar o teto sem pensar (e' o que protege o Control Room).
  if (!complete) {
    const of = knownTotal != null ? ` (o Control Room reporta ${knownTotal} na janela)` : "";
    console.warn(
      `[activity] ATENCAO: a janela de 7 dias tem mais de ${GLOBAL_PAGE_SIZE * GLOBAL_MAX_PAGES} execucoes${of} - ` +
        `so as ${all.length} mais recentes foram lidas, os dias mais antigos ficam incompletos.`
    );
  }

  return all;
}

/**
 * FONTE UNICA de historico de execucoes pra TUDO (lista de robos, detalhe de
 * robo, schedule, snapshot do dashboard): uma unica busca global dos ultimos
 * 7 dias, em cache por 90s. NUNCA fazemos uma consulta de activity/list POR
 * ROBO ou POR AGENDAMENTO - isso ja causou uma rajada de chamadas simultaneas
 * grande o suficiente pra derrubar o Control Room de producao por
 * esgotamento de memoria. O numero de chamadas ao Control Room por aqui e
 * FIXO (no maximo 10 paginas) e nao cresce com a quantidade de
 * robos/agendamentos do ambiente. Mesmo "single-flight" de getSchedules():
 * chamadas concorrentes esperam a mesma busca em vez de disparar outra.
 */
let globalActivity7dCache: { data: Activity[]; expiresAt: number } | null = null;
let globalActivity7dInFlight: Promise<Activity[]> | null = null;
const GLOBAL_ACTIVITY_CACHE_TTL_MS = 90 * 1000;

async function getGlobalActivity7d(): Promise<Activity[]> {
  if (globalActivity7dCache && Date.now() < globalActivity7dCache.expiresAt) {
    logCache("activity7d", "HIT");
    return globalActivity7dCache.data;
  }
  if (globalActivity7dInFlight) {
    logCache("activity7d", "JOIN");
    return globalActivity7dInFlight;
  }
  logCache("activity7d", "MISS");
  const since7dMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  globalActivity7dInFlight = listGlobalActivitySince(since7dMs)
    .then((data) => {
      globalActivity7dCache = { data, expiresAt: Date.now() + GLOBAL_ACTIVITY_CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      globalActivity7dInFlight = null;
    });
  return globalActivity7dInFlight;
}

/** Nome do dia da semana (igual ao array WEEKDAYS do frontend) a partir de Date.getDay() (0=domingo). */
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Quebra a MESMA busca global de 7 dias em execucoes/falhas por dia (os
 * ultimos 7 dias corridos, do mais antigo pro mais recente - cada dia da
 * semana aparece exatamente uma vez nessa janela). Zero chamada extra,
 * 100% em memoria. Usado nos graficos "Execucoes por dia"/"Falhas por dia"
 * do Dashboard, que ate agora eram mockados mesmo em modo live.
 */
function getDailyBreakdown(activities: Activity[]): { dia: string; execucoes: number; falhas: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { dia: string; execucoes: number; falhas: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const dayActivities = activities.filter((a) => {
      const t = new Date(a.startDateTime);
      return t >= dayStart && t < dayEnd;
    });
    const falhas = dayActivities.filter((a) => classifyRun(a.status) === "failure").length;

    days.push({ dia: WEEKDAY_LABELS[dayStart.getDay()], execucoes: dayActivities.length, falhas });
  }

  return days;
}

/** Agrupa a busca global por fileId - cada bot fica so com as execucoes dele, sem nenhuma chamada extra. */
function groupActivityByFile(activities: Activity[]): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const list = map.get(a.fileId);
    if (list) list.push(a);
    else map.set(a.fileId, [a]);
  }
  return map;
}

/**
 * Conta execucoes de hoje. Como a fonte agora e a janela global de 7 dias
 * (nao mais uma amostra limitada por robo), isso fica exato, sem risco de
 * subestimar em bots muito ativos.
 */
function countActivityToday(activities: Activity[]): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return activities.filter((r) => new Date(r.startDateTime) >= startOfDay).length;
}

/**
 * Classifica o resultado de uma execucao. Baseado originalmente no CSV
 * historico exportado do Control Room (status vinha como "Completed"/
 * "Stopped"/etc.) - so que um registro CRU real do endpoint /v3/activity/list
 * (2026-09-21, ver "[run-debug]") veio com status="RUN_FAILED", nao "FAILED"
 * como o CSV sugeria. O CSV exportado usa rotulo de exibicao, a API usa o
 * enum interno (prefixo "RUN_"). "FAILED"/"TIMED_OUT" ja usavam .includes()
 * (por sorte cobriam "RUN_FAILED" tambem), mas "COMPLETED" era igualdade
 * EXATA - se sucesso vier como "RUN_COMPLETED" (mesmo padrao), toda execucao
 * bem-sucedida caia em "excluded" ao inves de "success", zerando Health
 * Score/taxa de sucesso em modo live. Trocado pra .includes() nos 3, mais
 * resistente a variacao de prefixo/sufixo do enum. "RUN_ABORTED" = parada
 * manual (comum durante testes/debug) - nao e falha operacional de verdade,
 * fica de fora da conta assim como qualquer status nao mapeado.
 */
type RunOutcome = "success" | "failure" | "excluded";
function classifyRun(status: string): RunOutcome {
  if (status.includes("COMPLETED")) return "success";
  if (status.includes("FAILED") || status.includes("TIMED_OUT")) return "failure";
  return "excluded";
}

function durationMinutes(activity: Activity): number {
  const ms = new Date(activity.endDateTime).getTime() - new Date(activity.startDateTime).getTime();
  return ms > 0 ? ms / 60000 : 0;
}

/** "DOMINIO\\usuario.servico" -> "usuario.servico" (o Control Room devolve o userName com o dominio Windows junto - so o nome de usuario interessa na tela). */
function stripDomain(userName: string): string {
  const backslash = userName.lastIndexOf("\\");
  return backslash >= 0 ? userName.slice(backslash + 1) : userName;
}

/** Quantas execucoes/falhas o detalhe do robo devolve (janela ja limitada a 7 dias pela busca global). */
const ROBOT_RUNS_LIMIT = 10;
/** Teto do texto de erro devolvido - mensagem do Control Room pode ser um stack trace enorme. */
const RUN_ERROR_MAX_CHARS = 1500;

/** Traduz uma execucao do Control Room pro formato do detalhe do robo - 100% em memoria. */
function toRobotRun(a: Activity): RobotRun {
  return {
    startedAt: a.startDateTime,
    endedAt: a.endDateTime ?? "",
    status: a.status,
    outcome: classifyRun(a.status),
    durationMinutes: +durationMinutes(a).toFixed(2),
    machine: a.deviceName ?? "",
    error: errorMessage(a).slice(0, RUN_ERROR_MAX_CHARS),
  };
}

/** Teto de falhas devolvidas no log das 24h - "total" continua sendo a contagem real. */
const FAILURE_LOG_LIMIT = 300;

function toFailureLogEntry(a: Activity, schedulesByFile: Map<string, AutomationSchedule[]>): FailureLogEntry {
  return {
    startedAt: a.startDateTime,
    endedAt: a.endDateTime ?? "",
    status: a.status,
    durationMinutes: +durationMinutes(a).toFixed(2),
    fileId: a.fileId,
    botName: a.fileName,
    machine: a.deviceName ?? "",
    user: stripDomain(a.userName ?? ""),
    runType: a.type ?? "",
    initiation: a.initiationType ?? "",
    automationName: a.automationName ?? "",
    failedIn: a.currentBotName ?? "",
    line: typeof a.currentLine === "number" ? a.currentLine : null,
    totalLines: typeof a.totalLines === "number" ? a.totalLines : null,
    error: errorMessage(a).slice(0, RUN_ERROR_MAX_CHARS),
    schedules: (schedulesByFile.get(a.fileId) ?? []).map((s) => ({
      name: s.activityName,
      type: s.scheduleType,
      startTime: s.startTime,
      status: s.status,
    })),
  };
}

/** Agrupa os agendamentos por bot (um bot pode ter mais de um agendamento). */
interface ScheduledBot {
  fileId: string;
  fileName: string;
  schedules: AutomationSchedule[];
}

function groupSchedulesByBot(schedules: AutomationSchedule[]): ScheduledBot[] {
  const byFile = new Map<string, ScheduledBot>();
  for (const s of schedules) {
    const existing = byFile.get(s.fileId);
    if (existing) {
      existing.schedules.push(s);
    } else {
      byFile.set(s.fileId, { fileId: s.fileId, fileName: s.fileName, schedules: [s] });
    }
  }
  return Array.from(byFile.values());
}

/**
 * Monta um Robot (contrato do painel) a partir dos dados reais do Control Room.
 * A lista de robos do painel = os bots que tem agendamento configurado no
 * Control Room.
 *
 * "activities" ja vem pronto (fatia da busca global de 7 dias so desse bot) -
 * essa funcao e 100% em memoria, sem nenhuma chamada ao Control Room.
 *
 * ATENCAO - decisoes que precisam de validacao com o time:
 *  - "name" usa o nome do agendamento diretamente (fileName) - nao consulta
 *    mais o repositorio de arquivos (decisao do time: nao vale o custo dessa
 *    busca so pra exibir nome/area).
 *  - "area" fica fixo em "Geral" por enquanto - vai virar um campo editavel
 *    manualmente na tela de robos (preenchido por automacao/pessoa, nao pelo
 *    Control Room). O campo ja existe no contrato, so falta o endpoint de
 *    edicao quando isso for implementado.
 *  - status: "Erro" se a ultima execucao (que nao foi parada manualmente)
 *    falhou de verdade; senao "Pausado" se TODOS os agendamentos desse bot
 *    estiverem "INACTIVE" no Control Room; senao "Ativo".
 *  - "runs"/"fails" usam classifyRun, dentro da janela de 7 dias: paradas
 *    manuais (RUN_ABORTED/"Stopped") e execucoes em andamento ficam de fora
 *    da conta, so entram sucesso e falha real. Se o bot rodou menos de 10
 *    vezes relevantes nos ultimos 7 dias, "runs" fica com menos de 10 itens
 *    (nao busca mais pra tras pra completar - e a troca aceita pra nao ter
 *    mais consulta individual por robo).
 *  - slaTarget/sla/minT/maxT/apis/systems/tickets/pendencies nao vem do Control
 *    Room (sao dados de negocio/ServiceNow) - ficam com valores neutros no MVP.
 */
function buildRobot(bot: ScheduledBot, activities: Activity[]): Robot {
  const execToday = countActivityToday(activities);

  const relevant = activities.filter((r) => classifyRun(r.status) !== "excluded");
  const recentRuns = relevant.slice(0, RUN_HISTORY_LENGTH);

  const runs = recentRuns.map((r) => classifyRun(r.status) === "success");
  const fails = runs.filter((ok) => !ok).length;
  const avg = recentRuns.length
    ? recentRuns.reduce((sum, r) => sum + durationMinutes(r), 0) / recentRuns.length
    : 0;

  const last = recentRuns[0];
  const lastFailed = recentRuns.find((r) => classifyRun(r.status) === "failure");

  const isPaused = bot.schedules.every((s) => s.status !== "ACTIVE");
  const status = last && classifyRun(last.status) === "failure" ? "Erro" : isPaused ? "Pausado" : "Ativo";

  const failures7d = relevant.filter((r) => classifyRun(r.status) === "failure").length;

  // Menor/maior duracao real entre as mesmas execucoes usadas na media (antes ficava 0/0 em modo live).
  const durations = recentRuns.map(durationMinutes).filter((d) => d > 0);

  return {
    id: bot.fileId,
    name: bot.fileName,
    area: "Geral",
    environment: "Producao",
    machine: last?.deviceName ?? "",
    developer: last ? stripDomain(last.userName) : "",
    status,
    fails,
    runs,
    avg,
    lastExec: last?.startDateTime ?? "",
    nextExec: "",
    lastError: lastFailed ? errorMessage(lastFailed) : "",
    execToday,
    failures7d,
    monitored: isMonitored(bot.fileId),
    tickets: 0,
    slaTarget: 0,
    sla: 0,
    minT: durations.length ? +Math.min(...durations).toFixed(2) : 0,
    maxT: durations.length ? +Math.max(...durations).toFixed(2) : 0,
    apis: [],
    systems: [],
    pendencies: [],
  };
}

/** Slot de 15min a partir de "HH:MM" (0..95). */
function timeToSlot(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Math.floor((h * 60 + m) / 15);
}

/**
 * Tipos de agendamento que a tela Schedule sabe tratar hoje. Prod tem DAILY,
 * WEEKLY e MONTHLY - MONTHLY foi deixado de fora DE PROPOSITO (decisao do
 * time): a grade e uma semana fixa (Seg-Dom que se repete toda semana), e um
 * agendamento mensal ("todo dia 15", por ex.) nao tem dia da semana fixo -
 * cairia num dia diferente a cada mes, entao encaixar ele na grade mostraria
 * informacao errada, nao so incompleta. Filtrado em TODO lugar relacionado a
 * agendamento (grade e os cards de contagem), pra os numeros baterem entre
 * si - nao faz sentido "Total de agendamentos" contar mensal se a grade
 * nunca mostra nenhum.
 */
const SUPPORTED_SCHEDULE_TYPES = new Set(["DAILY", "WEEKLY"]);
function isSupportedSchedule(s: AutomationSchedule): boolean {
  return SUPPORTED_SCHEDULE_TYPES.has(s.scheduleType);
}

function weekdaysForSchedule(s: AutomationSchedule): string[] {
  if (s.scheduleType === "WEEKLY" && s.weeklyRecurrence) {
    return s.weeklyRecurrence.daysOfWeek;
  }
  if (s.scheduleType === "DAILY") {
    // "DAILY" na Automation Anywhere = todo santo dia, inclui fim de semana.
    return ALL_WEEKDAYS;
  }
  return [];
}

/**
 * Pra cada robo MONITORADO, olha a falha mais recente dele dentro da MESMA
 * busca global de 7 dias que ja temos em maos (zero chamada extra ao Control
 * Room). Se essa falha for mais nova que a ultima que ja notificamos pra
 * esse robo, dispara o webhook do Teams (ver teamsNotifier.ts - mockado por
 * padrao) e atualiza o marcador de "ultima notificada".
 *
 * Chamado a partir de getActivitySnapshot() (rodado sempre que o Dashboard
 * carrega) - como esse app nao tem scheduler/cron, essa e a unica forma de
 * detectar falha nova sem um processo rodando sozinho: so quando alguem
 * abre/atualiza a tela. Ver decisao do time de deixar em modo mock por
 * enquanto (2026-08-31) antes de ligar o envio real.
 */
function checkMonitoredFailures(activities: Activity[]): void {
  const monitored = getMonitoredIds();
  if (monitored.length === 0) return;

  const byFile = groupActivityByFile(activities);
  for (const fileId of monitored) {
    const acts = byFile.get(fileId) ?? [];
    const lastFailure = acts.find((a) => classifyRun(a.status) === "failure");
    if (!lastFailure) continue;

    const lastNotified = getLastNotifiedFailureAt(fileId);
    if (lastNotified && new Date(lastNotified) >= new Date(lastFailure.startDateTime)) continue;

    setLastNotifiedFailureAt(fileId, lastFailure.startDateTime);
    notifyFailure({
      robotId: fileId,
      robotName: lastFailure.fileName,
      machine: lastFailure.deviceName,
      errorMessage: errorMessage(lastFailure),
      startedAt: lastFailure.startDateTime,
      endedAt: lastFailure.endDateTime,
    }).catch((err) => console.error("[teams-notify] erro inesperado:", err));
  }
}

function machineForSchedule(s: AutomationSchedule, devices: Device[]): string {
  const device = devices.find((d) => d.defaultUsers.some((u) => s.runAsUserIds.includes(u.id)));
  return device?.hostName ?? "";
}

/**
 * Monta o ScheduleEntry (grid semanal) a partir do Control Room. "activities"
 * ja vem pronto (fatia da busca global de 7 dias so desse agendamento) - 100%
 * em memoria, sem chamada ao Control Room.
 *
 * ATENCAO - "dur" (duracao) e "timeout" NAO existem no /v2/schedule/automations/list
 * (esse endpoint so tem o horario de INICIO, sem duracao configurada). Por enquanto
 * estimamos os dois a partir da media de duracao das ultimas execucoes REAIS dentro
 * da janela de 7 dias (nao conta parada manual/RUN_ABORTED - senao a media fica
 * puxada pra baixo por cancelamentos rapidos de teste). Fallback: 1 slot / 30min
 * se nao houver historico relevante nos ultimos 7 dias.
 *
 * "machine": prefere o deviceName da execucao mais recente (dado OBSERVADO,
 * mesma fonte confiavel usada em buildRobot) em vez de inferir via
 * machineForSchedule() (que cruza runAsUserIds com defaultUsers dos devices -
 * quebra quando o mesmo usuario "runner" e o default user de VARIAS maquinas
 * num pool, porque o .find() sempre pega a primeira que bater, colapsando
 * tudo pras mesmas poucas maquinas). So cai pra inferencia se o agendamento
 * nao tiver nenhuma execucao real nos ultimos 7 dias pra observar.
 */
function buildScheduleEntries(s: AutomationSchedule, devices: Device[], activities: Activity[]): ScheduleEntry[] {
  const days = weekdaysForSchedule(s);
  if (days.length === 0) return [];

  const recentRuns = activities.filter((r) => classifyRun(r.status) !== "excluded").slice(0, 5);
  const avgMinutes = recentRuns.length
    ? recentRuns.reduce((sum, r) => sum + durationMinutes(r), 0) / recentRuns.length
    : 30;

  const dur = Math.max(1, Math.round(avgMinutes / 15));
  const timeout = Math.max(15, Math.round(avgMinutes));
  const start = timeToSlot(s.startTime);
  const machine = activities[0]?.deviceName || machineForSchedule(s, devices);

  return days.map((day) => ({
    id: `${s.id}-${day}`,
    machine,
    day: WEEKDAY_INDEX[day],
    start,
    dur,
    robot: s.fileId,
    process: s.activityName,
    timeout,
    scheduleType: s.scheduleType as "DAILY" | "WEEKLY",
  }));
}

export const automationAnywhereService = {
  async listRobots(): Promise<Robot[]> {
    if (env.controlRoom.mode === "mock") {
      return (await repo.findAll()).map(withMonitored);
    }
    const [schedules, activities] = await Promise.all([getSchedules(), getGlobalActivity7d()]);
    const activityByFile = groupActivityByFile(activities);
    const bots = groupSchedulesByBot(schedules);
    return bots.map((bot) => buildRobot(bot, activityByFile.get(bot.fileId) ?? []));
  },

  async getRobot(id: string): Promise<Robot | undefined> {
    if (env.controlRoom.mode === "mock") {
      const r = await repo.findById(id);
      return r ? withMonitored(r) : undefined;
    }
    const [schedules, activities] = await Promise.all([getSchedules(), getGlobalActivity7d()]);
    const bots = groupSchedulesByBot(schedules);
    const bot = bots.find((b) => b.fileId === id);
    if (!bot) return undefined;
    return buildRobot(bot, activities.filter((a) => a.fileId === id));
  },

  /**
   * Execucoes REAIS de um robo (duracao, resultado, maquina e a mensagem de
   * erro que o Control Room registrou) - fatia da MESMA busca global de 7
   * dias que ja alimenta a lista de robos (cache 90s + single-flight), entao
   * abrir o detalhe de um robo nao dispara nenhuma chamada nova ao Control
   * Room enquanto o cache estiver quente. A busca global ja vem ordenada da
   * execucao mais recente pra mais antiga.
   */
  async getRobotRuns(id: string): Promise<RobotRuns> {
    if (env.controlRoom.mode === "mock") {
      return { runs: [], failures: [], simulated: true };
    }
    const activities = await getGlobalActivity7d();
    const mine = activities.filter((a) => a.fileId === id);

    return {
      runs: mine.slice(0, ROBOT_RUNS_LIMIT).map(toRobotRun),
      failures: mine.filter((a) => classifyRun(a.status) === "failure").slice(0, ROBOT_RUNS_LIMIT).map(toRobotRun),
      simulated: false,
    };
  },

  /**
   * Log das falhas reais (mesma regra do card "Falhas (ultimas 24h)" do
   * Dashboard quando hours=24, entao a contagem bate) - cada uma com o bot,
   * a maquina, a mensagem de erro e os agendamentos configurados pra aquele
   * bot (o "processo"). "hours" vai de 1 a 168 (7 dias = a janela inteira que
   * a busca global ja guarda em cache) - nunca cria busca nova ao Control
   * Room, so filtra o que ja esta em memoria (+ a lista de agendamentos,
   * tambem em cache de 5min).
   */
  async getRecentFailures(hoursParam = 24): Promise<FailureLog> {
    const hours = Math.min(168, Math.max(1, Math.round(hoursParam) || 24));
    if (env.controlRoom.mode === "mock") {
      return { hours, total: 0, failures: [], simulated: true };
    }
    const [activities, schedules] = await Promise.all([getGlobalActivity7d(), getSchedules()]);
    const since = Date.now() - hours * 60 * 60 * 1000;
    const failed = activities.filter(
      (a) => new Date(a.startDateTime).getTime() >= since && classifyRun(a.status) === "failure"
    );
    const schedulesByFile = new Map<string, AutomationSchedule[]>();
    for (const s of schedules) {
      const list = schedulesByFile.get(s.fileId);
      if (list) list.push(s);
      else schedulesByFile.set(s.fileId, [s]);
    }
    return {
      hours,
      total: failed.length,
      failures: failed.slice(0, FAILURE_LOG_LIMIT).map((a) => toFailureLogEntry(a, schedulesByFile)),
      simulated: false,
    };
  },

  async getSchedule(): Promise<ScheduleEntry[]> {
    if (env.controlRoom.mode === "mock") {
      const file = path.join(env.dataDir, "schedule.json");
      return JSON.parse(fs.readFileSync(file, "utf-8")) as ScheduleEntry[];
    }
    const [schedules, devices, activities] = await Promise.all([getSchedules(), listDevices(), getGlobalActivity7d()]);

    // A grade so mostra agendamento ATIVO de proposito (decisao do time) - um
    // agendamento inativo nao vai rodar, entao nao faz sentido ocupar espaco
    // visual na tela como se fosse execucao real. O card "Inativos" do
    // Dashboard (getScheduleSummary) continua contando os dois, separado.
    const supported = schedules.filter(isSupportedSchedule).filter((s) => s.status === "ACTIVE");

    // Diagnostico de agendamento sem maquina resolvida - acontece quando o
    // usuario padrao do agendamento (runAsUserIds) nao bate com o usuario
    // padrao de nenhum device cadastrado (ver machineForSchedule()). So loga
    // UMA VEZ por processo (nao a cada carregamento/poll da tela) pra nao
    // poluir o terminal.
    if (!scheduleDebugLogged) {
      scheduleDebugLogged = true;
      const unmatched = supported.filter((s) => weekdaysForSchedule(s).length > 0 && !machineForSchedule(s, devices));
      if (unmatched.length > 0) {
        console.log(`[schedule-debug] ${unmatched.length} agendamento(s) sem maquina resolvida:`, unmatched.map((s) => ({ fileName: s.fileName, runAsUserIds: s.runAsUserIds })));
      }
    }

    const activityByFile = groupActivityByFile(activities);
    const entries = supported.map((s) => buildScheduleEntries(s, devices, activityByFile.get(s.fileId) ?? []));
    return entries.flat();
  },

  /**
   * Contagem "crua" dos agendamentos (sem agrupar por bot, sem expandir por
   * dia da semana) - bate com o que o proprio Control Room mostra na tela
   * "Scheduled activities" (ex.: 15 agendamentos, 1 ativo, 14 inativos).
   *
   * "activeRobots" e diferente: agrupa por bot (mesma logica do listRobots,
   * onde 5 agendamentos do mesmo bot viram 1 robo so) e conta quantos robos
   * unicos tem PELO MENOS UM agendamento ativo. Da visibilidade de quantos
   * robos distintos estao de fato rodando, sem inflar pela quantidade de
   * agendamentos duplicados de um mesmo bot.
   */
  async getScheduleSummary(): Promise<{ total: number; active: number; inactive: number; activeRobots: number }> {
    if (env.controlRoom.mode === "mock") {
      const file = path.join(env.dataDir, "schedule.json");
      const entries = JSON.parse(fs.readFileSync(file, "utf-8")) as ScheduleEntry[];
      const uniqueRobots = new Set(entries.map((e) => e.robot)).size;
      return { total: entries.length, active: entries.length, inactive: 0, activeRobots: uniqueRobots };
    }
    const schedules = (await getSchedules()).filter(isSupportedSchedule);
    const active = schedules.filter((s) => s.status === "ACTIVE").length;
    const bots = groupSchedulesByBot(schedules);
    const activeRobots = bots.filter((bot) => bot.schedules.some((s) => s.status === "ACTIVE")).length;
    return { total: schedules.length, active, inactive: schedules.length - active, activeRobots };
  },

  /**
   * "execToday": quantas execucoes aconteceram desde a meia-noite de hoje, no
   * Control Room INTEIRO (todo bot, agendado ou nao). "failures24h": falhas
   * reais nas ultimas 24h, tambem do Control Room inteiro - de proposito,
   * pra dar visibilidade geral de saude do ambiente, nao so dos robos
   * trackeados.
   *
   * "topFailures7d": ranking de falhas reais nos ultimos 7 dias por bot,
   * SEM filtrar por ter agendamento ou nao - de proposito, pra refletir o
   * historico real do Control Room inteiro (inclui bot rodado na mao/teste
   * manual). O "Robos mais instaveis" do Dashboard usa essa MESMA lista
   * (nao o `failures7d` por robo agendado) - as duas visoes tem que bater.
   *
   * "dailyBreakdown": execucoes/falhas por dia dos ultimos 7 dias corridos -
   * alimenta os graficos "Execucoes por dia"/"Falhas por dia" do Dashboard
   * (antes mockados, agora dado real).
   *
   * Tudo calculado em cima da MESMA busca global de 7 dias (cache
   * compartilhado com listRobots/getSchedule) - nao dispara busca propria.
   */
  async getActivitySnapshot(): Promise<{
    execToday: number;
    failures24h: number;
    topFailures7d: { fileId: string; name: string; count: number }[];
    dailyBreakdown: { dia: string; execucoes: number; falhas: number }[];
  }> {
    if (env.controlRoom.mode === "mock") {
      const mockRobots = await repo.findAll();
      const topFailures7d = [...mockRobots]
        .filter((r) => r.fails > 0)
        .sort((a, b) => b.fails - a.fails)
        .slice(0, 10)
        .map((r) => ({ fileId: r.id, name: r.name, count: r.fails }));
      return {
        execToday: mockRobots.reduce((a, r) => a + r.execToday, 0),
        failures24h: mockRobots.reduce((a, r) => a + r.fails, 0),
        topFailures7d,
        dailyBreakdown: WEEKDAY_LABELS.slice(1).concat(WEEKDAY_LABELS[0]).map((dia, i) => ({
          dia,
          execucoes: [180, 210, 165, 240, 195, 60, 40][i],
          falhas: [8, 12, 6, 15, 9, 3, 2][i],
        })),
      };
    }

    const activities = await getGlobalActivity7d();
    checkMonitoredFailures(activities);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const since24hMs = Date.now() - 24 * 60 * 60 * 1000;

    const execToday = activities.filter((r) => new Date(r.startDateTime) >= startOfDay).length;
    const failures24h = activities.filter(
      (r) => new Date(r.startDateTime).getTime() >= since24hMs && classifyRun(r.status) === "failure"
    ).length;

    const failuresByBot = new Map<string, { name: string; count: number }>();
    for (const a of activities) {
      if (classifyRun(a.status) !== "failure") continue;
      const existing = failuresByBot.get(a.fileId);
      if (existing) {
        existing.count += 1;
      } else {
        failuresByBot.set(a.fileId, { name: a.fileName, count: 1 });
      }
    }
    const topFailures7d = Array.from(failuresByBot.entries())
      .map(([fileId, v]) => ({ fileId, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { execToday, failures24h, topFailures7d, dailyBreakdown: getDailyBreakdown(activities) };
  },

  /**
   * Liga/desliga o monitoramento (notificacao no Teams em caso de falha) de
   * um robo especifico. E so um toggle persistido - nao dispara nenhuma
   * chamada ao Control Room, nao busca nada de novo.
   */
  async setRobotMonitored(id: string, monitored: boolean): Promise<void> {
    setMonitored(id, monitored);
  },
};
