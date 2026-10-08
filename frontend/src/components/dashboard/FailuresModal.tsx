import { useEffect, useMemo, useState } from "react";
import { X, Search, CalendarClock, Server, User, Play, AlertTriangle } from "lucide-react";
import { Card, Skeleton } from "../ui";
import { T, mono } from "../../constants/theme";
import { formatDateTime, formatRunDuration } from "../../utils/datetime";
import { robotShortCode } from "../../utils/robotCode";
import { runStatusLabel } from "../../utils/runStatus";
import { automationAnywhereService } from "../../services/automationAnywhereService";
import type { FailureLog, FailureLogEntry, FailureSchedule } from "../../types";

const SCHEDULE_TYPE_LABEL: Record<string, string> = { DAILY: "Diário", WEEKLY: "Semanal", MONTHLY: "Mensal" };

/** Traduz o "type"/"initiationType" cru do Control Room; valor desconhecido aparece como veio, sem inventar rótulo. */
function triggerLabel(runType: string, initiation: string): string {
  if (runType.includes("SCHEDULE") || initiation.includes("SCHEDULE")) return "Agendada";
  if (runType.includes("RUN_NOW")) {
    if (initiation.includes("DEBUG")) return "Manual (debug)";
    return "Manual";
  }
  return runType || initiation || "—";
}

function scheduleText(s: FailureSchedule): string {
  const type = SCHEDULE_TYPE_LABEL[s.type] ?? s.type;
  const inactive = s.status === "INACTIVE" ? " · inativo" : "";
  return `${s.name} · ${type}${s.startTime ? ` ${s.startTime}` : ""}${inactive}`;
}

function Meta({ icon: Icon, children }: { icon: typeof Server; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: T.sub }}>
      <Icon size={12} color={T.muted} />
      {children}
    </span>
  );
}

function FailureCard({ f, onOpenRobot }: { f: FailureLogEntry; onOpenRobot?: (fileId: string) => void }) {
  const where = f.failedIn && f.failedIn !== f.botName ? f.failedIn : "";
  const line = f.line != null ? `linha ${f.line}${f.totalLines ? ` de ${f.totalLines}` : ""}` : "";
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        {onOpenRobot ? (
          <button
            onClick={() => onOpenRobot(f.fileId)}
            title="Abrir detalhe do robô"
            style={{ fontFamily: mono, color: T.accent, fontSize: 12.5, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            {robotShortCode(f.botName, f.fileId)}
          </button>
        ) : (
          <span style={{ fontFamily: mono, color: T.accent, fontSize: 12.5, flexShrink: 0 }}>{robotShortCode(f.botName, f.fileId)}</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.botName}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#f87171", background: "#f8717118", border: "1px solid #f8717144", borderRadius: 99, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>
          {runStatusLabel(f.status)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginBottom: 8 }}>
        <Meta icon={CalendarClock}>
          {formatDateTime(f.startedAt)}
          {f.durationMinutes > 0 ? ` · ${formatRunDuration(f.durationMinutes)}` : ""}
        </Meta>
        {f.machine && <Meta icon={Server}>{f.machine}</Meta>}
        {f.user && <Meta icon={User}>{f.user}</Meta>}
        <Meta icon={Play}>{triggerLabel(f.runType, f.initiation)}</Meta>
      </div>

      <div style={{ fontSize: 11.5, color: T.sub, marginBottom: 8 }}>
        <span style={{ color: T.muted }}>Processo: </span>
        {f.schedules.length > 0 ? (
          f.schedules.map((s) => scheduleText(s)).join("  |  ")
        ) : (
          <span style={{ color: T.muted }}>sem agendamento (execução manual/teste)</span>
        )}
      </div>

      {(where || line) && (
        <div style={{ fontSize: 11.5, color: T.sub, marginBottom: 8 }}>
          <span style={{ color: T.muted }}>Falhou em: </span>
          <span style={{ fontFamily: mono }}>{[where, line].filter(Boolean).join(" · ")}</span>
        </div>
      )}

      <pre
        style={{ margin: 0, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.28)", border: `1px solid ${T.border}`, fontFamily: mono, fontSize: 11.5, lineHeight: 1.5, color: f.error ? "#fca5a5" : T.muted, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 130, overflowY: "auto" }}
      >
        {f.error || "O Control Room não registrou mensagem de erro pra essa execução."}
      </pre>
    </div>
  );
}

/**
 * Drill-down do card "Falhas (últimas 24h)": lista cada falha real com o bot,
 * o processo (agendamento), a máquina e a mensagem de erro do Control Room.
 * Só busca quando abre (o dado vem do mesmo cache de 7 dias do backend).
 */
export function FailuresModal({
  onClose,
  initialHours = 24,
  bot,
  registeredIds,
  onOpenRobot,
}: {
  onClose: () => void;
  initialHours?: 24 | 168;
  /** Quando presente, lista só as falhas desse bot (vem de clicar numa linha de "Robôs mais instáveis"). */
  bot?: { fileId: string; name: string };
  /** ids de robôs cadastrados em /robots - só esses ganham o código clicável (abre o detalhe). */
  registeredIds?: Set<string>;
  onOpenRobot?: (id: string) => void;
}) {
  const [hours, setHours] = useState<24 | 168>(initialHours);
  const [botFilter, setBotFilter] = useState(bot ?? null);
  const [log, setLog] = useState<FailureLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLog(null);
    setError(null);
    automationAnywhereService
      .getRecentFailures(hours)
      .then((data) => { if (!cancelled) setLog(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar as falhas"); });
    return () => { cancelled = true; };
  }, [hours]);

  const filtered = useMemo(() => {
    if (!log) return [];
    const q = query.trim().toLowerCase();
    const base = botFilter ? log.failures.filter((f) => f.fileId === botFilter.fileId) : log.failures;
    if (!q) return base;
    return base.filter((f) =>
      [f.botName, f.fileId, f.machine, f.user, f.error, f.failedIn, ...f.schedules.map((s) => s.name)].join(" ").toLowerCase().includes(q)
    );
  }, [log, query, botFilter]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,7,13,0.78)", display: "grid", placeItems: "center", padding: 20 }}
    >
      <Card
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 22, width: "min(760px, 96vw)", maxHeight: "min(720px, 88vh)", display: "flex", flexDirection: "column", background: T.bg1 }}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 12, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
              {hours === 24 ? "Falhas das últimas 24h" : "Falhas dos últimos 7 dias"}
            </h3>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {!log
                ? "Carregando…"
                : botFilter
                  ? `${filtered.length} de ${log.total} no Control Room (exclui paradas manuais)`
                  : `${log.total} ${log.total === 1 ? "falha real" : "falhas reais"} no Control Room (exclui paradas manuais)`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: T.sub, cursor: "pointer", background: "none", border: "none", borderRadius: 6, padding: 3, transition: "color 0.15s, background 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; e.currentTarget.style.background = "none"; }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12, flexShrink: 0 }}>
          <div className="flex items-center gap-1" style={{ padding: 3, borderRadius: 9, background: T.surface, border: `1px solid ${T.border}` }}>
            {([[24, "24 horas"], [168, "7 dias"]] as const).map(([h, label]) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", color: hours === h ? T.bg0 : T.sub, background: hours === h ? T.accent : "transparent", border: "none", transition: "background 0.15s, color 0.15s" }}
              >
                {label}
              </button>
            ))}
          </div>
          {botFilter && (
            <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: T.text, background: T.surfaceHi, border: `1px solid ${T.borderHi}`, borderRadius: 99, padding: "4px 6px 4px 10px", maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Bot: {botFilter.name}</span>
              <button
                onClick={() => setBotFilter(null)}
                title="Ver falhas de todos os bots"
                style={{ display: "grid", placeItems: "center", background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 1 }}
              >
                <X size={13} />
              </button>
            </span>
          )}
        </div>

        {log && log.failures.length > 0 && (
          <div style={{ position: "relative", marginBottom: 12, flexShrink: 0 }}>
            <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por bot, máquina, usuário, agendamento ou texto do erro…"
              style={{ width: "100%", padding: "8px 12px 8px 30px", borderRadius: 9, fontSize: 12, color: T.text, outline: "none", background: T.surface, border: `1px solid ${T.border}` }}
            />
          </div>
        )}

        <div className="flex flex-col gap-2" style={{ overflowY: "auto" }}>
          {!log && !error && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={120} radius={10} />)}
          {error && (
            <div className="flex items-center gap-2" style={{ padding: "10px 12px", borderRadius: 10, fontSize: 12, color: "#f87171", background: "#f8717112", border: "1px solid #f8717133" }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {log && log.failures.length === 0 && (
            <p style={{ fontSize: 12.5, color: T.muted, padding: "18px 0", textAlign: "center" }}>
              {log.simulated ? "Sem histórico real em modo mock." : `Nenhuma falha real ${hours === 24 ? "nas últimas 24h" : "nos últimos 7 dias"}.`}
            </p>
          )}
          {log && log.failures.length > 0 && filtered.length === 0 && (
            <p style={{ fontSize: 12.5, color: T.muted, padding: "18px 0", textAlign: "center" }}>
              {botFilter && !query.trim() ? `Nenhuma falha desse bot ${hours === 24 ? "nas últimas 24h" : "nos últimos 7 dias"}.` : "Nenhuma falha encontrada com esse filtro."}
            </p>
          )}
          {filtered.map((f, i) => (
            <FailureCard
              key={`${f.fileId}-${f.startedAt}-${i}`}
              f={f}
              onOpenRobot={onOpenRobot && registeredIds?.has(f.fileId) ? onOpenRobot : undefined}
            />
          ))}
          {log && log.total > log.failures.length && (
            <p style={{ fontSize: 11.5, color: T.muted, textAlign: "center", padding: "6px 0" }}>
              Mostrando as {log.failures.length} mais recentes de {log.total}.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
