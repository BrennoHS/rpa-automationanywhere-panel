import { useEffect, useMemo, useState } from "react";
import {
  X, AlertTriangle, CheckCircle2, Plus, Tag, Trash2, FileText, GitBranch, ExternalLink, BellRing,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Card, Panel, HealthBadge, HealthDot, StatusChip, Skeleton } from "../components/ui";
import { T, mono } from "../constants/theme";
import { automationAnywhereService } from "../services/automationAnywhereService";
import { formatDateTime, formatDuration, formatRunDuration, shortDateTime } from "../utils/datetime";
import { robotShortCode } from "../utils/robotCode";
import { OUTCOME_COLORS, runStatusLabel } from "../utils/runStatus";
import type { Robot, RobotRun, RobotRuns, Pendency, Priority } from "../types";

interface Props {
  robot: Robot;
  onClose: () => void;
  onUpdate: (robotId: string, pendencies: Pendency[]) => void;
  onToggleMonitor: (robotId: string, monitored: boolean) => void;
}

const InfoField = ({ label, value, m }: { label: string; value: string | number; m?: boolean }) => (
  <div>
    <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, color: T.text, fontFamily: m ? mono : "inherit" }}>{value}</div>
  </div>
);

interface RunBarPoint {
  label: string;
  minutos: number;
  run: RobotRun;
}

/** Tooltip da barra: mostra a execução REAL (horário, resultado, duração exata, máquina e o erro, se houve). */
function RunTooltip({ active, payload }: { active?: boolean; payload?: { payload: RunBarPoint }[] }) {
  if (!active || !payload?.length) return null;
  const run = payload[0].payload.run;
  return (
    <div style={{ background: "#0e1526", border: `1px solid ${T.borderHi}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, maxWidth: 320 }}>
      <div style={{ color: T.text, fontFamily: mono }}>{formatDateTime(run.startedAt)}</div>
      <div style={{ color: OUTCOME_COLORS[run.outcome], fontWeight: 600, marginTop: 3 }}>{runStatusLabel(run.status)}</div>
      <div style={{ color: T.sub, marginTop: 3 }}>Duração: {formatRunDuration(run.durationMinutes)}</div>
      {run.machine && <div style={{ color: T.sub }}>Máquina: {run.machine}</div>}
      {run.outcome === "failure" && run.error && (
        <div style={{ color: "#fca5a5", marginTop: 5, lineHeight: 1.35 }}>{run.error.length > 160 ? `${run.error.slice(0, 160)}…` : run.error}</div>
      )}
    </div>
  );
}

export function RobotDetail({ robot, onClose, onUpdate, onToggleMonitor }: Props) {
  const [tab, setTab] = useState<"geral" | "exec" | "falhas" | "pend">("geral");
  const [pendencies, setPendencies] = useState<Pendency[]>(robot.pendencies);
  const [draft, setDraft] = useState("");
  const [prio, setPrio] = useState<Priority>("Média");

  // Execuções reais - só busca quando alguém abre uma das duas abas que usam (a busca
  // no backend é uma fatia do histórico global que já está em cache, sem custo extra
  // no Control Room, mas não faz sentido pedir se a pessoa nunca vai olhar).
  const [runsData, setRunsData] = useState<RobotRuns | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState(false);
  const needsRuns = tab === "exec" || tab === "falhas";

  useEffect(() => {
    if (!needsRuns || runsData) return;
    let cancelled = false;
    setRunsLoading(true);
    setRunsError(false);
    automationAnywhereService
      .getRobotRuns(robot.id)
      .then((data) => {
        if (!cancelled) setRunsData(data);
      })
      .catch((err) => {
        console.error("Falha ao carregar execuções do robô:", err);
        if (!cancelled) setRunsError(true);
      })
      .finally(() => {
        if (!cancelled) setRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsRuns, runsData, robot.id]);

  // Do mais antigo pro mais recente (esquerda -> direita). useMemo: sem isso o
  // array novo a cada render fazia o Recharts reanimar todas as barras.
  const runBars = useMemo<RunBarPoint[]>(
    () =>
      (runsData?.runs ?? [])
        .slice()
        .reverse()
        .map((run) => ({ label: shortDateTime(run.startedAt), minutos: run.durationMinutes, run })),
    [runsData]
  );

  const commit = (list: Pendency[]) => {
    setPendencies(list);
    onUpdate(robot.id, list);
  };

  const add = () => {
    if (!draft.trim()) return;
    commit([{ id: "p" + Date.now(), text: draft.trim(), tag: "Nota", prio, done: false }, ...pendencies]);
    setDraft("");
  };

  const tabs: [typeof tab, string][] = [
    ["geral", "Visão geral"],
    ["exec", "Execuções"],
    ["falhas", "Falhas"],
    ["pend", `Pendências (${pendencies.filter((p) => !p.done).length})`],
  ];

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(4,7,13,0.78)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 96vw)", height: "100%", background: T.bg1, borderLeft: `1px solid ${T.borderHi}`, overflowY: "auto", boxShadow: "-30px 0 60px rgba(0,0,0,0.5)" }}
      >
        <div style={{ padding: 22, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.bg1, zIndex: 2 }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <HealthDot fails={robot.fails} size={12} />
              <div>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: mono, color: T.accent, fontSize: 14 }}>{robotShortCode(robot.name, robot.id)}</span>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{robot.name}</h2>
                </div>
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <StatusChip status={robot.status} />
                  <HealthBadge fails={robot.fails} />
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ color: T.sub, cursor: "pointer", background: "none", border: "none" }}>
              <X size={22} />
            </button>
          </div>

          <button
            onClick={() => onToggleMonitor(robot.id, !robot.monitored)}
            className="inline-flex items-center gap-2"
            title={robot.monitored ? "Desativar notificação no Teams em caso de falha" : "Notificar o grupo de sustentação no Teams quando esse robô falhar"}
            style={{
              marginTop: 14,
              padding: "8px 12px",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: robot.monitored ? "#a3e635" : T.sub,
              background: robot.monitored ? "#a3e63518" : T.surface,
              border: `1px solid ${robot.monitored ? "#a3e63555" : T.border}`,
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
            }}
          >
            <BellRing size={14} />
            {robot.monitored ? "Monitorando — avisa o time no Teams se falhar" : "Monitorar"}
            <span
              style={{
                marginLeft: 6,
                width: 30,
                height: 17,
                borderRadius: 99,
                background: robot.monitored ? "#a3e635" : "rgba(255,255,255,0.14)",
                position: "relative",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: robot.monitored ? 15 : 2,
                  width: 13,
                  height: 13,
                  borderRadius: 99,
                  background: robot.monitored ? T.bg0 : "#e7ecf5",
                  transition: "left 0.15s",
                }}
              />
            </span>
          </button>
          <div className="flex gap-1" style={{ marginTop: 16 }}>
            {tabs.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", color: tab === k ? T.bg0 : T.sub, background: tab === k ? T.accent : T.surface, border: `1px solid ${tab === k ? T.accent : T.border}` }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {tab === "geral" && (
            <div className="flex flex-col gap-5">
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                <InfoField label="Área de negócio" value={robot.area} />
                <InfoField label="Máquina" value={robot.machine} m />
                <InfoField label="Ambiente" value={robot.environment} />
                <InfoField label="Responsável" value={robot.developer} />
                <InfoField label="Última execução" value={formatDateTime(robot.lastExec)} m />
                <InfoField label="Próxima execução" value={robot.nextExec ? formatDateTime(robot.nextExec) : "-"} m />
                <InfoField label="Tempo médio" value={formatRunDuration(robot.avg)} m />
                <InfoField label="Tempo mín / máx" value={`${formatRunDuration(robot.minT)} / ${formatRunDuration(robot.maxT)}`} m />
                <InfoField label="Execuções hoje" value={robot.execToday} m />
                <InfoField label="SLA" value={robot.slaTarget > 0 ? `${robot.sla}% (meta ${robot.slaTarget}%)` : "—"} m />
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <Card style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>APIs utilizadas</div>
                  <div className="flex flex-wrap gap-1.5">
                    {robot.apis.map((a) => (
                      <span key={a} style={{ padding: "3px 9px", borderRadius: 7, fontSize: 11, color: T.accent2, background: "#818cf81a", border: "1px solid #818cf844", fontFamily: mono }}>
                        {a}
                      </span>
                    ))}
                  </div>
                </Card>
                <Card style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Sistemas utilizados</div>
                  <div className="flex flex-wrap gap-1.5">
                    {robot.systems.map((s) => (
                      <span key={s} style={{ padding: "3px 9px", borderRadius: 7, fontSize: 11, color: T.sub, background: T.surfaceHi, border: `1px solid ${T.border}` }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
              <div className="flex flex-wrap gap-2">
                {([["Documentação", FileText], ["Fluxograma", GitBranch], ["Repositório", ExternalLink]] as const).map(([l, Icon]) => (
                  <span key={l} className="inline-flex items-center gap-1.5" style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12, color: T.sub, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                    <Icon size={13} /> {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(tab === "exec" || tab === "falhas") && runsData?.simulated && (
            <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 9, fontSize: 12, color: T.sub, background: T.surface, border: `1px solid ${T.border}` }}>
              Dados de exemplo — sem histórico real (Control Room em modo mock).
            </div>
          )}

          {(tab === "exec" || tab === "falhas") && runsLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton height={46} radius={10} />
              <Skeleton height={46} radius={10} />
              <Skeleton height={46} radius={10} />
            </div>
          )}

          {(tab === "exec" || tab === "falhas") && runsError && (
            <div style={{ color: T.muted, fontSize: 13 }}>Não foi possível carregar as execuções desse robô agora.</div>
          )}

          {tab === "exec" && runsData && (
            <Panel
              title="Duração por execução"
              sub={`Últimas ${runBars.length} execuções (janela de 7 dias) — tempo real em minutos. Verde = sucesso, vermelho = falha, cinza = parada manual ou em andamento`}
            >
              {runBars.length === 0 ? (
                <div style={{ color: T.muted, fontSize: 13 }}>Nenhuma execução nos últimos 7 dias.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={runBars} margin={{ left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" interval={0} tick={{ fill: T.muted, fontSize: 9.5 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} unit=" min" width={52} />
                    <Tooltip content={<RunTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} isAnimationActive={false} />
                    <Bar dataKey="minutos" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {runBars.map((b, i) => (
                        <Cell key={i} fill={OUTCOME_COLORS[b.run.outcome]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          )}

          {tab === "falhas" && runsData && (
            <div className="flex flex-col gap-2">
              {runsData.failures.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>Sem falhas nos últimos 7 dias.</div>}
              {runsData.failures.length > 0 && (
                <div style={{ fontSize: 12, color: T.muted }}>
                  {runsData.failures.length} falha{runsData.failures.length > 1 ? "s" : ""} mais recente{runsData.failures.length > 1 ? "s" : ""} (janela de 7 dias) — a causa é a mensagem registrada pelo Control Room.
                </div>
              )}
              {runsData.failures.map((f, i) => (
                <Card key={`${f.startedAt}-${i}`} style={{ padding: 14 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 12, color: "#f87171" }}>
                      <AlertTriangle size={14} /> {runStatusLabel(f.status)}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: T.muted }}>{formatDateTime(f.startedAt)}</span>
                  </div>
                  <pre style={{ fontFamily: mono, fontSize: 11.5, color: "#fca5a5", background: "rgba(248,113,113,0.06)", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap", margin: 0, border: "1px solid rgba(248,113,113,0.15)" }}>
                    {f.error || "(o Control Room não registrou mensagem de erro nessa execução)"}
                  </pre>
                  <div className="flex items-center gap-4" style={{ marginTop: 8, fontSize: 11, color: T.muted, flexWrap: "wrap" }}>
                    <span>Duração: <span style={{ color: T.sub }}>{formatRunDuration(f.durationMinutes)}</span></span>
                    {f.machine && <span>Máquina: <span style={{ color: T.sub }}>{f.machine}</span></span>}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "pend" && (
            <div className="flex flex-col gap-3">
              <Card style={{ padding: 14 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Nova observação técnica…"
                  style={{ width: "100%", minHeight: 60, resize: "vertical", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 9, padding: 10, color: T.text, fontSize: 13, outline: "none" }}
                />
                <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                  <select
                    value={prio}
                    onChange={(e) => setPrio(e.target.value as Priority)}
                    style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px", color: T.text, fontSize: 12, outline: "none" }}
                  >
                    {(["Alta", "Média", "Baixa"] as Priority[]).map((p) => (
                      <option key={p} style={{ background: T.bg1 }}>{p}</option>
                    ))}
                  </select>
                  <button onClick={add} className="inline-flex items-center gap-1.5" style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, background: T.accent, color: T.bg0, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "none" }}>
                    <Plus size={14} /> Adicionar
                  </button>
                </div>
              </Card>
              {pendencies.map((p) => {
                const pc = p.prio === "Alta" ? "#f87171" : p.prio === "Média" ? "#facc15" : "#34d399";
                return (
                  <Card key={p.id} style={{ padding: 14, opacity: p.done ? 0.55 : 1 }}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => commit(pendencies.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)))}
                        style={{ marginTop: 2, width: 18, height: 18, borderRadius: 6, cursor: "pointer", flexShrink: 0, border: `1.5px solid ${p.done ? "#34d399" : T.borderHi}`, background: p.done ? "#34d399" : "transparent", display: "grid", placeItems: "center" }}
                      >
                        {p.done && <CheckCircle2 size={13} color={T.bg0} />}
                      </button>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, color: T.text, textDecoration: p.done ? "line-through" : "none", lineHeight: 1.5 }}>{p.text}</p>
                        <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                          <span className="inline-flex items-center gap-1" style={{ fontSize: 10, color: T.sub, padding: "2px 7px", borderRadius: 6, background: T.surfaceHi, border: `1px solid ${T.border}` }}>
                            <Tag size={10} /> {p.tag}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: pc, padding: "2px 7px", borderRadius: 6, background: `${pc}18`, border: `1px solid ${pc}40` }}>{p.prio}</span>
                        </div>
                      </div>
                      <button onClick={() => commit(pendencies.filter((x) => x.id !== p.id))} style={{ color: T.muted, cursor: "pointer", background: "none", border: "none" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
