export type RobotStatus = "Ativo" | "Pausado" | "Erro";
export type Priority = "Alta" | "Média" | "Baixa";

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
  fails: number;
  runs: boolean[];
  avg: number;
  lastExec: string;
  nextExec: string;
  lastError: string;
  execToday: number;
  /** falhas reais nos ultimos 7 dias - opcional pq mock nao tem */
  failures7d?: number;
  /** true = time de sustentacao quer ser avisado no Teams quando esse robo falhar */
  monitored: boolean;
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

/** Uma execucao REAL do robo no Control Room (historico de 7 dias ja em memoria - nenhuma chamada extra). */
export interface RobotRun {
  startedAt: string;
  /** vazio enquanto a execucao ainda esta em andamento */
  endedAt: string;
  /** status cru do Control Room (COMPLETED, FAILED, TIMED_OUT, RUN_ABORTED...) */
  status: string;
  outcome: RunOutcome;
  durationMinutes: number;
  machine: string;
  /** mensagem de erro registrada pelo Control Room (vazia se nao houve) */
  error: string;
}

export interface RobotRuns {
  /** ultimas execucoes de qualquer resultado, da mais recente pra mais antiga */
  runs: RobotRun[];
  /** ultimas falhas reais (FAILED/TIMED_OUT), da mais recente pra mais antiga */
  failures: RobotRun[];
  /** true = Control Room em modo mock, nao ha historico real */
  simulated: boolean;
}

/** Agendamento do Control Room configurado pra um bot - o "processo" por tras da execucao que falhou. */
export interface FailureSchedule {
  name: string;
  type: string;
  startTime: string;
  status: string;
}

/** Uma falha real (FAILED/TIMED_OUT) das ultimas 24h, com o bot, o processo e a mensagem de erro do Control Room. */
export interface FailureLogEntry {
  startedAt: string;
  endedAt: string;
  status: string;
  durationMinutes: number;
  fileId: string;
  botName: string;
  machine: string;
  user: string;
  /** "type" cru do Control Room (RUN_NOW, SCHEDULE...) - o front traduz pra rotulo legivel */
  runType: string;
  /** "initiationType" cru (DEBUG, CREATOR, SCHEDULE...) */
  initiation: string;
  /** nome da execucao no Control Room (bot + data + usuario) */
  automationName: string;
  /** sub-bot/tarefa que estava rodando na hora da falha */
  failedIn: string;
  line: number | null;
  totalLines: number | null;
  error: string;
  /** agendamentos que existem pra esse bot (vazio = bot sem agendamento, rodado na mao/teste) */
  schedules: FailureSchedule[];
}

export interface FailureLog {
  hours: number;
  /** total real de falhas na janela (pode ser maior que failures.length se passou do teto de envio) */
  total: number;
  failures: FailureLogEntry[];
  simulated: boolean;
}

export interface ScheduleEntry {
  id: string;
  machine: string;
  day: number;
  start: number;
  dur: number;
  robot: string;
  process: string;
  timeout: number;
  /** tipo de agendamento no Control Room - so DAILY/WEEKLY chegam aqui (MONTHLY ja e filtrado antes) */
  scheduleType?: "DAILY" | "WEEKLY";
}
