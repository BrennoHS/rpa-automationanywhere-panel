import { useEffect, useMemo, useRef, useState } from "react";
import { Server, AlertTriangle, X, Trash2, Search, CalendarClock } from "lucide-react";
import { Card, Skeleton } from "../components/ui";
import { T, mono, glass } from "../constants/theme";
import { MACHINES, WEEKDAYS, SLOTS, slotLabel } from "../constants";
import { healthOf } from "../utils/health";
import { robotShortCode } from "../utils/robotCode";
import { automationAnywhereService } from "../services/automationAnywhereService";
import type { Robot, ScheduleEntry } from "../types";

type TypeFilter = "Todos" | "DAILY" | "WEEKLY";
const TYPE_LABEL: Record<TypeFilter, string> = { Todos: "Todos", DAILY: "Diário", WEEKLY: "Semanal" };

const ROW_H = 22;

/**
 * Layout tipo agenda (Google Calendar/Teams): agrupa agendamentos que se
 * sobrepoem no tempo em "clusters" e distribui cada cluster lado a lado.
 * Blocos sem sobreposicao com ninguem continuam ocupando a linha inteira.
 */
function layoutOverlaps(dayEntries: ScheduleEntry[]): Map<string, { col: number; totalCols: number }> {
  const layout = new Map<string, { col: number; totalCols: number }>();
  const sorted = [...dayEntries].sort((a, b) => a.start - b.start);

  let cluster: ScheduleEntry[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const placed: { entry: ScheduleEntry; col: number }[] = [];
    for (const e of cluster) {
      let col = columnEnds.findIndex((end) => end <= e.start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(e.start + e.dur);
      } else {
        columnEnds[col] = e.start + e.dur;
      }
      placed.push({ entry: e, col });
    }
    const totalCols = columnEnds.length;
    for (const p of placed) {
      layout.set(p.entry.id, { col: p.col, totalCols });
    }
    cluster = [];
  };

  for (const e of sorted) {
    if (cluster.length === 0 || e.start < clusterEnd) {
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.start + e.dur);
    } else {
      flushCluster();
      cluster.push(e);
      clusterEnd = e.start + e.dur;
    }
  }
  flushCluster();

  return layout;
}

export function Schedule() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);
  const [machine, setMachine] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("Todos");
  const [robotFilter, setRobotFilter] = useState<string | null>(null);
  const [robotQuery, setRobotQuery] = useState("");
  const [robotDropdownOpen, setRobotDropdownOpen] = useState(false);
  const robotSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([automationAnywhereService.getSchedule(), automationAnywhereService.getRobots()])
      .then(([scheduleData, robotsData]) => {
        setEntries(scheduleData);
        setRobots(robotsData);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (robotSearchRef.current && !robotSearchRef.current.contains(e.target as Node)) {
        setRobotDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const robotResults = useMemo(() => {
    const q = robotQuery.trim().toLowerCase();
    if (!q) return [];
    return robots.filter((r) => [r.id, r.name].join(" ").toLowerCase().includes(q)).slice(0, 6);
  }, [robots, robotQuery]);

  const clearRobotFilter = () => {
    setRobotFilter(null);
    setRobotQuery("");
  };

  // lista de maquinas vem dos agendamentos reais; MACHINES so serve de fallback
  // enquanto os dados ainda nao chegaram (evita a tela ficar sem abas piscando).
  const machines = useMemo(() => {
    const fromEntries = Array.from(new Set(entries.map((e) => e.machine))).sort();
    return fromEntries.length > 0 ? fromEntries : MACHINES;
  }, [entries]);

  const activeMachine = machine ?? machines[0];
  const mine = entries.filter(
    (e) =>
      e.machine === activeMachine &&
      (typeFilter === "Todos" || e.scheduleType === typeFilter) &&
      (!robotFilter || e.robot === robotFilter)
  );
  const filtersActive = typeFilter !== "Todos" || !!robotFilter;

  const robotById = useMemo(() => new Map(robots.map((r) => [r.id, r])), [robots]);

  // conflitos: sobreposicao de horario no mesmo dia/maquina
  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (let d = 0; d < 7; d++) {
      const day = mine.filter((e) => e.day === d);
      for (let i = 0; i < day.length; i++) {
        for (let j = i + 1; j < day.length; j++) {
          const a = day[i];
          const b = day[j];
          if (a.start < b.start + b.dur && b.start < a.start + a.dur) {
            set.add(a.id);
            set.add(b.id);
          }
        }
      }
    }
    return set;
  }, [mine]);

  // layout (coluna/total de colunas) por dia, pra desenhar blocos conflitantes lado a lado
  const layoutByDay = useMemo(() => {
    const byDay = new Map<number, Map<string, { col: number; totalCols: number }>>();
    for (let d = 0; d < 7; d++) {
      byDay.set(d, layoutOverlaps(mine.filter((e) => e.day === d)));
    }
    return byDay;
  }, [mine]);

  const occ = WEEKDAYS.map((_, d) =>
    Math.round((mine.filter((e) => e.day === d).reduce((a, e) => a + e.dur, 0) / SLOTS) * 100)
  );

  const save = (upd: ScheduleEntry) => {
    setEntries(entries.map((e) => (e.id === upd.id ? upd : e)));
    setEditing(null);
  };
  const del = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {machines.map((mch) => (
          <button
            key={mch}
            onClick={() => setMachine(mch)}
            className="inline-flex items-center gap-2"
            style={{ padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: mono, cursor: "pointer", color: activeMachine === mch ? T.bg0 : T.sub, background: activeMachine === mch ? T.accent : T.surface, border: `1px solid ${activeMachine === mch ? T.accent : T.border}`, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { if (activeMachine === mch) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (activeMachine === mch) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.sub; }}
          >
            <Server size={13} /> {mch}
          </button>
        ))}
        {conflictIds.size > 0 && (
          <span className="inline-flex items-center gap-1.5" style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 9, fontSize: 12, color: "#f87171", background: "#f8717118", border: "1px solid #f8717144" }}>
            <AlertTriangle size={14} /> {conflictIds.size / 2} conflito(s) de horário
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div ref={robotSearchRef} style={{ position: "relative", width: "min(260px, 100%)" }}>
          <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={robotFilter ? `${robotShortCode(robotById.get(robotFilter)?.name ?? "", robotFilter)} — ${robotById.get(robotFilter)?.name ?? robotFilter}` : robotQuery}
            onChange={(e) => { setRobotFilter(null); setRobotQuery(e.target.value); setRobotDropdownOpen(true); }}
            onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.surfaceHi; setRobotDropdownOpen(true); }}
            onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}
            placeholder="Filtrar por robô…"
            style={{ width: "100%", padding: robotFilter ? "8px 30px 8px 30px" : "8px 12px 8px 30px", borderRadius: 9, fontSize: 12, color: T.text, outline: "none", background: T.surface, border: `1px solid ${T.border}`, transition: "border-color 0.15s, background 0.15s" }}
          />
          {robotFilter && (
            <button
              onClick={clearRobotFilter}
              title="Limpar filtro de robô"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: T.muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "grid", placeItems: "center", borderRadius: 6, transition: "color 0.15s, background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "none"; }}
            >
              <X size={13} />
            </button>
          )}
          {robotDropdownOpen && !robotFilter && robotResults.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, ...glass, background: T.bg1, padding: 6, zIndex: 40 }}>
              {robotResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRobotFilter(r.id); setRobotQuery(""); setRobotDropdownOpen(false); }}
                  className="flex items-center gap-2.5"
                  style={{ width: "100%", padding: "8px 9px", borderRadius: 7, cursor: "pointer", background: "none", border: "none", textAlign: "left", transition: "background 0.12s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHi)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontFamily: mono, fontSize: 11.5, color: T.accent, flexShrink: 0 }}>{robotShortCode(r.name, r.id)}</span>
                  <span style={{ fontSize: 12, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ width: 1, height: 20, background: T.border, margin: "0 2px" }} />
        <CalendarClock size={13} color={T.muted} />
        {(["Todos", "DAILY", "WEEKLY"] as TypeFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{ padding: "6px 12px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer", color: typeFilter === t ? T.text : T.muted, background: typeFilter === t ? T.surfaceHi : "transparent", border: `1px solid ${typeFilter === t ? T.borderHi : "transparent"}`, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { if (typeFilter === t) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; }}
            onMouseLeave={(e) => { if (typeFilter === t) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.muted; }}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}

        {filtersActive && (
          <button
            onClick={() => { setTypeFilter("Todos"); clearRobotFilter(); }}
            style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer", color: T.accent, background: "none", border: `1px solid ${T.border}`, transition: "background 0.15s, border-color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.borderHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = T.border; }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: T.sub, marginBottom: 10, fontWeight: 600 }}>Ocupação diária · {activeMachine}</div>
        {loading ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(7,1fr)" }}>
            {WEEKDAYS.map((d) => (
              <div key={d}>
                <Skeleton height={11} width={28} style={{ marginBottom: 6 }} />
                <Skeleton height={6} radius={99} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(7,1fr)" }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d}>
                <div className="flex justify-between" style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                  <span>{d}</span>
                  <span style={{ fontFamily: mono, color: occ[i] > 60 ? "#fb923c" : T.sub }}>{occ[i]}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${occ[i]}%`, height: "100%", background: occ[i] > 60 ? "#fb923c" : T.accent }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {filtersActive && mine.length === 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 12, color: T.muted, background: T.surface, border: `1px solid ${T.border}` }}>
          Nenhum agendamento em <strong style={{ color: T.sub }}>{activeMachine}</strong> com esses filtros. O robô ou tipo escolhido pode estar em outra máquina — troque de aba acima ou limpe os filtros.
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ width: 54, flexShrink: 0, padding: "10px 8px", fontSize: 10, color: T.muted, fontFamily: mono }}>Hora</div>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ flex: 1, padding: "10px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: T.text, borderLeft: `1px solid ${T.border}` }}>{d}</div>
          ))}
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", position: "relative" }}>
          <div style={{ width: 54, flexShrink: 0 }}>
            {Array.from({ length: SLOTS }, (_, s) => (
              <div key={s} style={{ height: ROW_H, borderBottom: s % 4 === 3 ? `1px solid ${T.border}` : "1px solid rgba(255,255,255,0.03)", fontSize: 9, color: s % 4 === 0 ? T.sub : "transparent", fontFamily: mono, paddingLeft: 8, display: "flex", alignItems: "center" }}>
                {s % 4 === 0 ? slotLabel(s) : "·"}
              </div>
            ))}
          </div>
          {loading &&
            WEEKDAYS.map((_, di) => (
              <div key={di} className="flex flex-col gap-2" style={{ flex: 1, borderLeft: `1px solid ${T.border}`, minWidth: 90, padding: "10px 6px" }}>
                <Skeleton height={40} radius={7} />
                <Skeleton height={28} radius={7} />
              </div>
            ))}
          {!loading &&
            WEEKDAYS.map((_, di) => (
            <div key={di} style={{ flex: 1, position: "relative", borderLeft: `1px solid ${T.border}`, minWidth: 90 }}>
              {Array.from({ length: SLOTS }, (_, s) => (
                <div key={s} style={{ height: ROW_H, borderBottom: s % 4 === 3 ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.02)" }} />
              ))}
              {mine.filter((e) => e.day === di).map((e) => {
                const rb = robotById.get(e.robot);
                const name = rb?.name ?? e.robot;
                const clash = conflictIds.has(e.id);
                const col = clash ? "#f87171" : rb ? healthOf(rb.fails).color : T.accent;
                const pos = layoutByDay.get(di)?.get(e.id) ?? { col: 0, totalCols: 1 };
                const gapPct = 1;
                const widthPct = 100 / pos.totalCols;
                const leftPct = pos.col * widthPct;
                return (
                  <div
                    key={e.id}
                    onClick={() => setEditing(e)}
                    title={`${name} · ${e.process}`}
                    style={{
                      position: "absolute",
                      top: e.start * ROW_H + 1,
                      left: `calc(${leftPct}% + ${pos.col === 0 ? 3 : gapPct}px)`,
                      width: `calc(${widthPct}% - ${pos.col === pos.totalCols - 1 ? 6 : gapPct * 2}px)`,
                      height: e.dur * ROW_H - 2,
                      borderRadius: 7,
                      padding: "4px 6px",
                      cursor: "pointer",
                      overflow: "hidden",
                      background: `${col}22`,
                      border: `1px solid ${col}`,
                      borderLeft: `3px solid ${col}`,
                      zIndex: 1,
                      transition: "background 0.12s, box-shadow 0.12s, z-index 0.12s",
                    }}
                    onMouseEnter={(e2) => { e2.currentTarget.style.background = `${col}3d`; e2.currentTarget.style.boxShadow = `0 0 0 1px ${col}`; e2.currentTarget.style.zIndex = "2"; }}
                    onMouseLeave={(e2) => { e2.currentTarget.style.background = `${col}22`; e2.currentTarget.style.boxShadow = "none"; e2.currentTarget.style.zIndex = "1"; }}
                  >
                    <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: col, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                    <div style={{ fontSize: 9.5, color: T.sub, lineHeight: 1.2, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.process}</div>
                    {clash && <div style={{ fontSize: 8.5, color: "#f87171", marginTop: 2 }}>⚠ conflito</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <p style={{ fontSize: 11.5, color: T.muted }}>
        Clique em um agendamento para editar duração, robô ou timeout. Conflitos de execução simultânea na mesma máquina
        são destacados em vermelho e divididos lado a lado automaticamente.
      </p>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,7,13,0.78)", display: "grid", placeItems: "center" }}>
          <Card onClick={(e) => e.stopPropagation()} style={{ padding: 22, width: "min(420px,92vw)", background: T.bg1 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Editar agendamento</h3>
              <button
                onClick={() => setEditing(null)}
                style={{ color: T.sub, cursor: "pointer", background: "none", border: "none", borderRadius: 6, padding: 3, transition: "color 0.15s, background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; e.currentTarget.style.background = "none"; }}
              ><X size={18} /></button>
            </div>
            {([["robot", "Código do robô"], ["process", "Processo"]] as const).map(([k, l]) => (
              <label key={k} style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: T.muted }}>{l}</span>
                <input
                  value={editing[k]}
                  onChange={(ev) => setEditing({ ...editing, [k]: ev.target.value })}
                  style={{ width: "100%", marginTop: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, outline: "none" }}
                />
              </label>
            ))}
            <div className="flex gap-3" style={{ marginBottom: 16 }}>
              {([["dur", "Duração (slots × 15min)"], ["timeout", "Timeout (min)"]] as const).map(([k, l]) => (
                <label key={k} style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: T.muted }}>{l}</span>
                  <input
                    type="number"
                    value={editing[k]}
                    onChange={(ev) => setEditing({ ...editing, [k]: Number(ev.target.value) })}
                    style={{ width: "100%", marginTop: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: mono, outline: "none" }}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => del(editing.id)}
                className="inline-flex items-center gap-1.5"
                style={{ padding: "8px 14px", borderRadius: 8, color: "#f87171", background: "#f8717115", border: "1px solid #f8717140", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f8717128"; e.currentTarget.style.borderColor = "#f8717170"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#f8717115"; e.currentTarget.style.borderColor = "#f8717140"; }}
              >
                <Trash2 size={14} /> Remover
              </button>
              <button
                onClick={() => save(editing)}
                style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: 8, background: T.accent, color: T.bg0, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "none", transition: "filter 0.15s, transform 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.12)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
              >Salvar</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
