import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot, CalendarClock, CheckCircle2, XCircle, PauseCircle, Activity, Gauge,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Bar, BarChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Panel, StatCard, HealthDot, StatCardSkeleton, ChartSkeleton, Skeleton } from "../components/ui";
import { T, mono, chartTip } from "../constants/theme";
import { HEALTH, healthOf } from "../utils/health";
import { robotShortCode } from "../utils/robotCode";
import { FailuresModal } from "../components/dashboard/FailuresModal";
import { automationAnywhereService } from "../services/automationAnywhereService";
import { useApp } from "../hooks/useApp";

export function Dashboard() {
  const navigate = useNavigate();
  const { robots, loading: robotsLoading, openRobot } = useApp();
  const [scheduleSummary, setScheduleSummary] = useState({ total: 0, active: 0, inactive: 0, activeRobots: 0 });
  const [activitySnapshot, setActivitySnapshot] = useState<{
    execToday: number;
    failures24h: number;
    topFailures7d: { fileId: string; name: string; count: number }[];
    dailyBreakdown: { dia: string; execucoes: number; falhas: number }[];
  }>({ execToday: 0, failures24h: 0, topFailures7d: [], dailyBreakdown: [] });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [unstableView, setUnstableView] = useState<"list" | "chart">("list");
  const [hoveredHealth, setHoveredHealth] = useState<string | null>(null);
  const [failuresModal, setFailuresModal] = useState<{ hours: 24 | 168; bot?: { fileId: string; name: string } } | null>(null);

  // Promise.allSettled de proposito: resumo de agendamento e snapshot de
  // atividade sao fontes independentes - uma falhar nao pode apagar o dado
  // da outra que funcionou normalmente.
  const loadDashboardData = useCallback(async () => {
    const [summaryRes, snapshotRes] = await Promise.allSettled([
      automationAnywhereService.getScheduleSummary(),
      automationAnywhereService.getActivitySnapshot(),
    ]);

    if (summaryRes.status === "fulfilled") setScheduleSummary(summaryRes.value);
    else console.error("Falha ao carregar resumo de agendamento:", summaryRes.reason);

    if (snapshotRes.status === "fulfilled") setActivitySnapshot(snapshotRes.value);
    else console.error("Falha ao carregar snapshot de atividade:", snapshotRes.reason);
  }, []);

  useEffect(() => {
    loadDashboardData().finally(() => setDashboardLoading(false));
  }, [loadDashboardData]);

  const m = useMemo(() => {
    const fails = robots.reduce((a, r) => a + r.fails, 0);
    const totalRuns = robots.reduce((a, r) => a + r.runs.length, 0);
    const taxa = totalRuns ? Math.round(((totalRuns - fails) / totalRuns) * 1000) / 10 : 0;
    return { taxa };
  }, [robots]);

  const daily = activitySnapshot.dailyBreakdown;

  // mesma fonte (topFailures7d) alimentando as duas visualizacoes do painel
  // "Robos mais instaveis" (lista e grafico) - antes eram dois paineis
  // separados mostrando o mesmo dado de jeitos diferentes, so consolidado
  // num unico painel com toggle.
  const topFail = useMemo(
    () =>
      activitySnapshot.topFailures7d
        .slice(0, 6)
        .map((r) => ({ nome: r.name, falhas: r.count, color: healthOf(r.count).color })),
    [activitySnapshot.topFailures7d]
  );

  const unstable = useMemo(
    () =>
      activitySnapshot.topFailures7d
        .slice(0, 6)
        .map((r) => ({ id: r.fileId, name: r.name, instability: r.count })),
    [activitySnapshot.topFailures7d]
  );
  // barra e' relativa ao maior valor da lista, nao a um teto fixo de 10 -
  // com teto fixo, qualquer robo com 10+ falhas mostrava a barra sempre
  // cheia, escondendo a diferenca entre 10 e 16 falhas por exemplo.
  const maxInstability = Math.max(1, ...unstable.map((r) => r.instability));

  // nem toda entrada de topFailures7d tem um robo cadastrado por tras (tem
  // automacao rodando so em dev/teste, sem R0xx ainda) - o clique na linha abre
  // o log de falhas do bot (funciona pra qualquer um), e so os cadastrados
  // ganham o link pro detalhe do robo la dentro do modal.
  const robotIds = useMemo(() => new Set(robots.map((r) => r.id)), [robots]);

  // comparacao simples com o dia anterior (ambos vindo do mesmo dailyBreakdown
  // de 7 dias, sem chamada extra). So texto informativo (nao usa o delta/up
  // colorido do StatCard) porque nem "mais execucao" nem "mais falha" tem uma
  // direcao unica de "bom"/"ruim" que caiba num unico booleano de cor.
  const trend = useMemo(() => {
    if (daily.length < 2) return null;
    const today = daily[daily.length - 1];
    const yesterday = daily[daily.length - 2];
    const pct = (curr: number, prev: number) => {
      if (prev > 0) return Math.round(((curr - prev) / prev) * 100);
      return curr > 0 ? 100 : 0;
    };
    const fmt = (curr: number, prev: number) => {
      const p = pct(curr, prev);
      const arrow = curr > prev ? "▲" : curr < prev ? "▼" : "＝";
      return `${arrow} ${p > 0 ? "+" : ""}${p}% vs. ontem`;
    };
    const successRate = (exec: number, falhas: number) => (exec > 0 ? ((exec - falhas) / exec) * 100 : null);
    const rateToday = successRate(today.execucoes, today.falhas);
    const rateYesterday = successRate(yesterday.execucoes, yesterday.falhas);
    const taxaTrend = rateToday != null && rateYesterday != null ? fmt(rateToday, rateYesterday) : undefined;
    return {
      execucoes: fmt(today.execucoes, yesterday.execucoes),
      falhas: fmt(today.falhas, yesterday.falhas),
      taxa: taxaTrend,
    };
  }, [daily]);

  const cards = useMemo(
    () => [
      { icon: Bot, label: "Total de robôs ativos", value: scheduleSummary.activeRobots, tone: "#38bdf8", onClick: () => navigate("/robots") },
      { icon: CalendarClock, label: "Total de agendamentos", value: scheduleSummary.total, tone: T.accent, onClick: () => navigate("/schedule") },
      { icon: CheckCircle2, label: "Agendamentos ativos", value: scheduleSummary.active, tone: "#34d399", onClick: () => navigate("/schedule") },
      { icon: PauseCircle, label: "Agendamentos inativos", value: scheduleSummary.inactive, tone: "#94a3b8", onClick: () => navigate("/schedule") },
      { icon: XCircle, label: "Falhas (últimas 24h)", value: activitySnapshot.failures24h, tone: "#f87171", caption: trend?.falhas, onClick: () => setFailuresModal({ hours: 24 }) },
      { icon: Activity, label: "Execuções do dia", value: activitySnapshot.execToday, tone: "#22d3ee", caption: trend?.execucoes },
      { icon: Gauge, label: "Taxa de sucesso", value: `${m.taxa}%`, tone: "#a3e635", caption: trend?.taxa },
    ],
    [scheduleSummary, activitySnapshot.failures24h, activitySnapshot.execToday, m.taxa, trend, navigate]
  );

  return (
    <div className="flex flex-col gap-5">
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {dashboardLoading || robotsLoading
          ? cards.map((c) => <StatCardSkeleton key={c.label} />)
          : cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      <Panel
        title="Robôs mais instáveis"
        sub="Total de falhas reais nos últimos 7 dias — priorizar"
        right={
          unstable.length === 0 ? undefined : (
            <div className="flex items-center gap-1" style={{ padding: 3, borderRadius: 9, background: T.surface, border: `1px solid ${T.border}` }}>
              {(["list", "chart"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setUnstableView(v)}
                  style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", color: unstableView === v ? T.bg0 : T.sub, background: unstableView === v ? T.accent : "transparent", border: "none", transition: "background 0.15s, color 0.15s" }}
                >
                  {v === "list" ? "Lista" : "Gráfico"}
                </button>
              ))}
            </div>
          )
        }
      >
        {!dashboardLoading && unstable.length === 0 ? (
          <div className="flex flex-col items-center gap-2" style={{ padding: "28px 16px", textAlign: "center" }}>
            <span style={{ width: 38, height: 38, borderRadius: 99, display: "grid", placeItems: "center", background: "#34d39922", border: "1px solid #34d39944" }}>
              <CheckCircle2 size={19} color="#34d399" />
            </span>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Nenhuma falha nos últimos 7 dias</div>
            <div style={{ fontSize: 12, color: T.muted }}>Todo o histórico de execução do Control Room rodou sem erro real nessa janela.</div>
          </div>
        ) : unstableView === "list" ? (
          <div className="flex flex-col gap-2">
            {dashboardLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={`sk-${i}`} height={46} radius={10} />)}
            {!dashboardLoading && unstable.map((r) => {
              return (
                <div
                  key={r.id}
                  onClick={() => setFailuresModal({ hours: 168, bot: { fileId: r.id, name: r.name } })}
                  title="Ver o log das falhas desse bot"
                  className="flex items-center gap-3"
                  style={{ padding: "10px 12px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.borderHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; }}
                >
                  <HealthDot fails={r.instability} />
                  <span style={{ fontFamily: mono, color: T.accent, fontSize: 13, width: 60, flexShrink: 0 }}>{robotShortCode(r.name, r.id)}</span>
                  <span style={{ fontSize: 13, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <div style={{ width: 120, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ width: `${Math.max(6, (r.instability / maxInstability) * 100)}%`, height: "100%", background: healthOf(r.instability).color }} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: healthOf(r.instability).color, width: 76, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {r.instability} {r.instability === 1 ? "falha" : "falhas"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : dashboardLoading ? (
          <ChartSkeleton height={230} />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={topFail} layout="vertical" margin={{ left: 6, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="nome"
                tick={{ fill: T.sub, fontSize: 11, fontFamily: mono }}
                axisLine={false}
                tickLine={false}
                width={110}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
              />
              <Tooltip {...chartTip} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="falhas" radius={[0, 5, 5, 0]}>
                {topFail.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Saúde da frota" sub="Health Score de cada robô: falhas reais (nao conta parada manual) dentre as últimas 10 execuções relevantes — clique pra ver a lista filtrada">
        {robotsLoading ? (
          <>
            <Skeleton height={12} radius={99} style={{ marginBottom: 14 }} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {HEALTH.map((h) => (
                <Skeleton key={h.key} height={38} radius={10} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", gap: 2, marginBottom: 14 }}>
              {HEALTH.map((h) => {
                const n = robots.filter((r) => healthOf(r.fails).key === h.key).length;
                if (!n) return null;
                return (
                  <div
                    key={h.key}
                    onClick={() => navigate(`/robots?health=${h.key}`)}
                    onMouseEnter={() => setHoveredHealth(h.key)}
                    onMouseLeave={() => setHoveredHealth((k) => (k === h.key ? null : k))}
                    style={{ flex: n, background: h.color, position: "relative", cursor: "pointer" }}
                  >
                    {hoveredHealth === h.key && (
                      <div
                        style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", padding: "6px 10px", borderRadius: 8, background: "#0e1526", border: `1px solid ${T.borderHi}`, fontSize: 12, color: T.text, whiteSpace: "nowrap", zIndex: 20, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}
                      >
                        <span style={{ color: h.color, fontWeight: 700 }}>{h.label}</span> · {n} robô{n === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {HEALTH.map((h) => {
                const n = robots.filter((r) => healthOf(r.fails).key === h.key).length;
                return (
                  <div
                    key={h.key}
                    className="flex items-center gap-2"
                    onClick={() => navigate(`/robots?health=${h.key}`)}
                    style={{ padding: "8px 12px", borderRadius: 10, background: `${h.color}12`, border: `1px solid ${h.color}2e`, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${h.color}22`; e.currentTarget.style.borderColor = `${h.color}66`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = `${h.color}12`; e.currentTarget.style.borderColor = `${h.color}2e`; }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: h.color }} />
                    <span style={{ fontSize: 12, color: T.sub }}>{h.label}</span>
                    <span style={{ marginLeft: "auto", fontFamily: mono, fontWeight: 700, color: h.color }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Execuções e falhas por dia"
        sub="Volume processado e falhas registradas na última semana"
        right={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: T.sub }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: T.accent }} /> Execuções
            </span>
            <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: T.sub }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: "#facc15" }} /> Falhas
            </span>
          </div>
        }
      >
        {dashboardLoading ? (
          <ChartSkeleton height={260} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={daily} margin={{ left: -6, right: 6 }}>
              <defs>
                <linearGradient id="gExec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.accent} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFalhas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="dia" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              {/* Mesmo eixo pras duas areas de proposito - com eixo duplo (um 0-120,
                  outro 0-24) a onda de falhas conseguia ficar VISUALMENTE mais alta
                  que a de execucoes mesmo tendo um valor real bem menor, o que parecia
                  bug pra quem olha o grafico. Com eixo unico a altura de cada onda
                  reflete a proporcao real entre os dois valores. */}
              <YAxis tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTip} />
              <Area type="monotone" dataKey="execucoes" name="Execuções" stroke={T.accent} strokeWidth={2} fill="url(#gExec)" activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="falhas" name="Falhas" stroke="#facc15" strokeWidth={2} fill="url(#gFalhas)" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
      {failuresModal && (
        <FailuresModal
          key={`${failuresModal.hours}-${failuresModal.bot?.fileId ?? "all"}`}
          initialHours={failuresModal.hours}
          bot={failuresModal.bot}
          registeredIds={robotIds}
          onOpenRobot={(id) => { setFailuresModal(null); openRobot(id); }}
          onClose={() => setFailuresModal(null)}
        />
      )}
    </div>
  );
}
