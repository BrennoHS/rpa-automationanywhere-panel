import type { FailureLog, Robot, RobotRuns, ScheduleEntry } from "../types";
import { WEEKDAYS } from "../constants";
import { http, USE_MOCK } from "../api/httpClient";
import { robotsSeed, scheduleSeed, buildMockRuns } from "../models/mockData";

/**
 * Camada unica de acesso aos dados de robos.
 *
 * >>> PONTO DE TROCA <<<
 * Hoje retorna mocks (USE_MOCK = true). Para usar a API oficial do
 * Automation Anywhere, defina VITE_USE_MOCK=false no .env e ajuste os
 * endpoints. NENHUM componente precisa mudar.
 */
export const automationAnywhereService = {
  async getRobots(): Promise<Robot[]> {
    if (USE_MOCK) return Promise.resolve(robotsSeed);
    return http.get<Robot[]>("/robots");
  },

  async getRobot(id: string): Promise<Robot | undefined> {
    if (USE_MOCK) return Promise.resolve(robotsSeed.find((r) => r.id === id));
    return http.get<Robot>(`/robots/${id}`);
  },

  /** Execuções reais (duração, resultado, máquina, erro) do robô - abas "Execuções" e "Falhas" do detalhe. */
  async getRobotRuns(id: string): Promise<RobotRuns> {
    if (USE_MOCK) {
      const robot = robotsSeed.find((r) => r.id === id);
      return Promise.resolve(robot ? buildMockRuns(robot) : { runs: [], failures: [], simulated: true });
    }
    return http.get<RobotRuns>(`/robots/${id}/runs`);
  },

  /**
   * Liga/desliga notificacao no Teams pra esse robo. Em modo mock (sem
   * backend real) so resolve na hora - o toggle na tela.ainda funciona
   * (estado local via useRobots), so nao persiste em lugar nenhum.
   */
  async setMonitored(id: string, monitored: boolean): Promise<void> {
    if (USE_MOCK) return Promise.resolve();
    await http.patch(`/robots/${id}/monitor`, { monitored });
  },

  async getSchedule(): Promise<ScheduleEntry[]> {
    if (USE_MOCK) return Promise.resolve(scheduleSeed);
    return http.get<ScheduleEntry[]>("/schedule");
  },

  async getScheduleSummary(): Promise<{ total: number; active: number; inactive: number; activeRobots: number }> {
    if (USE_MOCK) {
      const uniqueRobots = new Set(scheduleSeed.map((e) => e.robot)).size;
      return Promise.resolve({ total: scheduleSeed.length, active: scheduleSeed.length, inactive: 0, activeRobots: uniqueRobots });
    }
    return http.get("/schedule/summary");
  },

  async getActivitySnapshot(): Promise<{
    execToday: number;
    failures24h: number;
    topFailures7d: { fileId: string; name: string; count: number }[];
    dailyBreakdown: { dia: string; execucoes: number; falhas: number }[];
  }> {
    if (USE_MOCK) {
      const topFailures7d = [...robotsSeed]
        .filter((r) => r.fails > 0)
        .sort((a, b) => b.fails - a.fails)
        .slice(0, 10)
        .map((r) => ({ fileId: r.id, name: r.name, count: r.fails }));
      return Promise.resolve({
        execToday: robotsSeed.reduce((a, r) => a + r.execToday, 0),
        failures24h: robotsSeed.reduce((a, r) => a + r.fails, 0),
        topFailures7d,
        dailyBreakdown: WEEKDAYS.map((dia, i) => ({
          dia,
          execucoes: [180, 210, 165, 240, 195, 60, 40][i],
          falhas: [8, 12, 6, 15, 9, 3, 2][i],
        })),
      });
    }
    return http.get("/activity/snapshot");
  },

  /** Log das falhas reais (24h = mesma regra do card "Falhas (últimas 24h)"; até 168h = 7 dias) - só buscado quando o modal abre. */
  async getRecentFailures(hours = 24): Promise<FailureLog> {
    if (USE_MOCK) {
      const failures = robotsSeed
        .filter((r) => r.fails > 0)
        .map((r) => ({
          startedAt: "2026-09-24T08:00:00Z",
          endedAt: "2026-09-24T08:04:00Z",
          status: "RUN_FAILED",
          durationMinutes: 4,
          fileId: r.id,
          botName: r.name,
          machine: r.machine,
          user: r.developer,
          runType: "SCHEDULE",
          initiation: "SCHEDULE",
          automationName: r.name,
          failedIn: r.name,
          line: null,
          totalLines: null,
          error: r.lastError,
          schedules: scheduleSeed
            .filter((e) => e.robot === r.id)
            .slice(0, 1)
            .map((e) => ({ name: e.process, type: e.scheduleType ?? "DAILY", startTime: "08:00", status: "ACTIVE" })),
        }));
      return Promise.resolve({ hours, total: failures.length, failures, simulated: true });
    }
    return http.get<FailureLog>(`/activity/failures?hours=${hours}`);
  },
};
