export type RobotStatus = "Ativo" | "Pausado" | "Erro";
export type Priority = "Alta" | "Média" | "Baixa";
export type HealthKey = "healthy" | "good" | "warn" | "degraded" | "critical";

export interface Pendency {
  id: string;
  text: string;
  tag: string;
  prio: Priority;
  done: boolean;
}

export interface Robot {
  id: string;
  name: string;
  area: string;
  environment: string;
  machine: string;
  developer: string;
  status: RobotStatus;
  /** falhas nas ultimas 10 execucoes (0..10) */
  fails: number;
  /** ultimas 10 execucoes: true = sucesso */
  runs: boolean[];
  /** tempo medio em minutos */
  avg: number;
  lastExec: string;
  nextExec: string;
  lastError: string;
  execToday: number;
  /** falhas reais nos ultimos 7 dias - opcional pq mock nao tem */
  failures7d?: number;
  /** true = time de sustentacao quer ser avisado no Teams quando esse robo falhar */
  monitored?: boolean;
  tickets: number;
  slaTarget: number;
  sla: number;
  minT: number;
  maxT: number;
  apis: string[];
  systems: string[];
  pendencies: Pendency[];
}

export type RunOutcome = "success" | "failure" | "excluded";

/** Uma execução REAL do robô no Control Room (histórico de 7 dias). */
export interface RobotRun {
  startedAt: string;
  /** vazio enquanto a execução ainda está em andamento */
  endedAt: string;
  /** status cru do Control Room (COMPLETED, FAILED, TIMED_OUT, RUN_ABORTED...) */
  status: string;
  outcome: RunOutcome;
  durationMinutes: number;
  machine: string;
  /** mensagem de erro registrada pelo Control Room (vazia se não houve) */
  error: string;
}

export interface RobotRuns {
  /** últimas execuções de qualquer resultado, da mais recente pra mais antiga */
  runs: RobotRun[];
  /** últimas falhas reais (FAILED/TIMED_OUT), da mais recente pra mais antiga */
  failures: RobotRun[];
  /** true = dados de exemplo (mock), não há histórico real */
  simulated: boolean;
}

/** Agendamento do Control Room configurado pro bot que falhou - o "processo" por tras da execução. */
export interface FailureSchedule {
  name: string;
  type: string;
  startTime: string;
  status: string;
}

/** Uma falha real das últimas 24h (Control Room), com bot, processo e mensagem de erro. */
export interface FailureLogEntry {
  startedAt: string;
  endedAt: string;
  status: string;
  durationMinutes: number;
  fileId: string;
  botName: string;
  machine: string;
  user: string;
  runType: string;
  initiation: string;
  automationName: string;
  /** sub-bot/tarefa que estava rodando na hora da falha */
  failedIn: string;
  line: number | null;
  totalLines: number | null;
  error: string;
  /** vazio = bot sem agendamento (rodado na mão/teste) */
  schedules: FailureSchedule[];
}

export interface FailureLog {
  hours: number;
  /** total real na janela (pode ser maior que failures.length se passou do teto de envio) */
  total: number;
  failures: FailureLogEntry[];
  /** true = dados de exemplo (mock) */
  simulated: boolean;
}

export interface ScheduleEntry {
  id: string;
  machine: string;
  /** 0 = Segunda ... 6 = Domingo */
  day: number;
  /** indice do slot de 15 min (0..95) */
  start: number;
  /** duracao em slots de 15 min */
  dur: number;
  robot: string;
  process: string;
  timeout: number;
  /** tipo de agendamento no Control Room - so DAILY/WEEKLY chegam aqui (MONTHLY ja e filtrado antes) */
  scheduleType?: "DAILY" | "WEEKLY";
}

export interface HealthLevel {
  max: number;
  key: HealthKey;
  label: string;
  color: string;
}

