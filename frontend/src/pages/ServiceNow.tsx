import { useCallback, useEffect, useMemo, useState } from "react";
import { Ticket, ClipboardList, ShieldCheck, History, Clock, Sparkles, HelpCircle, X, CalendarClock, ArrowLeft } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, StatCard, Panel, StatCardSkeleton, ChartSkeleton, Skeleton, RefreshBar, ExportButton } from "../components/ui";
import { T, mono, chartTip } from "../constants/theme";
import { formatDuration } from "../utils/datetime";
import { exportServiceNowReport } from "../utils/exportServiceNowReport";
import { computeProactiveStats } from "../utils/proactiveTickets";
import { showToast } from "../utils/toast";
import { serviceNowService } from "../services/serviceNowService";
import type { TicketsSummary, TicketsTrend, MonthSummary, Melhoria, CategoryCount, ReviewItem, TicketDetail, OverflowTicket } from "../services/serviceNowService";

const EMPTY_SUMMARY: TicketsSummary = {
  ticketsThisMonth: 0,
  ticketsInProgress: 0,
  ticketsOverflow: 0,
  overflowTickets: [],
  byAutomation: [],
  byProduct: [],
  byOrigin: [],
  byPriority: [],
  needsReview: [],
  tickets: [],
  slaCompliance: { evaluated: 0, percentage: null },
  mttr: { evaluated: 0, avgMinutes: null },
};
const EMPTY_TREND: TicketsTrend = { months: [] };
const ALL = "Todos";

/** Cor fixa por rotulo (nao por posicao) - assim "Incidente" sempre e a mesma cor, mesmo se a ordem mudar mes a mes. */
const ORIGIN_COLORS: Record<string, string> = {
  Solicitação: T.accent,
  Incidente: "#fb923c",
  Problema: "#f87171",
};

const PROACTIVE_COLORS: Record<string, string> = {
  Proativo: T.accent,
  Reativo: "#818cf8",
};

function CategoryBars({
  items,
  color,
  labelWidth = 170,
  selected,
  onSelect,
}: {
  items: CategoryCount[];
  color: string;
  labelWidth?: number;
  selected?: string | null;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Nenhum chamado identificado esse mês.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.label}
          onClick={() => onSelect?.(i.label)}
          className="flex items-center gap-3"
          style={{
            padding: "3px 5px",
            marginInline: -5,
            borderRadius: 7,
            cursor: onSelect ? "pointer" : undefined,
            background: selected === i.label ? T.surfaceHi : "transparent",
            transition: "background 0.12s",
          }}
        >
          <span
            title={i.label}
            style={{ fontFamily: mono, fontSize: 12, color: T.sub, width: labelWidth, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {i.label}
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${(i.count / max) * 100}%`, height: "100%", background: color }} />
          </div>
          <span style={{ fontFamily: mono, fontSize: 12, color: T.text, width: 24, textAlign: "right", flexShrink: 0 }}>{i.count}</span>
        </div>
      ))}
    </div>
  );
}

const DESCRIPTION_PREVIEW_LEN = 160;

/** Numero do chamado, clicavel quando temos o link direto pro ServiceNow (abre em aba nova) - sem link, so mostra o texto normal. */
function TicketNumberLink({ number, url }: { number: string; url: string }) {
  if (!url) {
    return <span style={{ fontFamily: mono, fontSize: 12, color: T.accent }}>{number}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontFamily: mono, fontSize: 12, color: T.accent, textDecoration: "none" }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
    >
      {number}
    </a>
  );
}

function MelhoriaCard({ m }: { m: Melhoria }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = m.description.length > DESCRIPTION_PREVIEW_LEN;
  const shown = expanded || !isLong ? m.description : `${m.description.slice(0, DESCRIPTION_PREVIEW_LEN)}…`;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <TicketNumberLink number={m.number} url={m.url} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: m.resolved ? "#34d399" : T.sub,
            background: m.resolved ? "#34d39918" : T.surfaceHi,
            padding: "2px 8px",
            borderRadius: 99,
          }}
        >
          {m.resolved ? `${m.state} em ${m.closedAt.slice(0, 16)}` : m.state}
        </span>
        <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>{m.openedAt.slice(0, 16)}</span>
      </div>
      <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4, marginBottom: 4 }}>{shown}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          {expanded ? "Ver menos" : "Ver texto completo"}
        </button>
      )}
      <div className="flex items-center gap-4" style={{ fontSize: 11.5, color: T.muted, marginTop: isLong ? 0 : 8, flexWrap: "wrap" }}>
        <span>
          Sintoma: <span style={{ color: T.sub }}>{m.symptom}</span>
        </span>
        <span>
          Aberto por: <span style={{ color: T.sub }}>{m.requester}</span>
        </span>
        <span>
          Atendendo: <span style={{ color: T.sub }}>{m.assignedTo}</span>
        </span>
      </div>
    </div>
  );
}

function ReviewItemCard({ item }: { item: ReviewItem }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.text.length > DESCRIPTION_PREVIEW_LEN;
  const shown = expanded || !isLong ? item.text : `${item.text.slice(0, DESCRIPTION_PREVIEW_LEN)}…`;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <TicketNumberLink number={item.number} url={item.url} />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#fb923c", background: "#fb923c1f", padding: "2px 8px", borderRadius: 99 }}>
          Sintoma: {item.sintoma}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#fb923c", background: "#fb923c1f", padding: "2px 8px", borderRadius: 99 }}>
          Subcategoria: {item.subcategoria}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4, marginBottom: isLong ? 4 : 8 }}>{shown}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          {expanded ? "Ver menos" : "Ver texto completo"}
        </button>
      )}
      <div className="flex items-center gap-4" style={{ fontSize: 11.5, color: T.muted, flexWrap: "wrap" }}>
        <span>
          Aberto por: <span style={{ color: T.sub }}>{item.requester}</span>
        </span>
        <span>
          Atendendo: <span style={{ color: T.sub }}>{item.assignedTo}</span>
        </span>
      </div>
    </div>
  );
}

function TicketDetailCard({ t }: { t: TicketDetail }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = t.description.length > DESCRIPTION_PREVIEW_LEN;
  const shown = expanded || !isLong ? t.description : `${t.description.slice(0, DESCRIPTION_PREVIEW_LEN)}…`;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <TicketNumberLink number={t.number} url={t.url} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: t.resolved ? "#34d399" : "#fb923c",
            background: t.resolved ? "#34d39918" : "#fb923c1f",
            padding: "2px 8px",
            borderRadius: 99,
          }}
        >
          {t.resolved ? "Resolvido" : "Em aberto"}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4, marginBottom: isLong || t.resolutionNote ? 4 : 0 }}>{shown}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: t.resolutionNote ? 8 : 0 }}
        >
          {expanded ? "Ver menos" : "Ver texto completo"}
        </button>
      )}
      {t.resolutionNote && (
        <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>Nota de resolução</span>
          <p style={{ fontSize: 12, color: T.sub, lineHeight: 1.4, marginTop: 3 }}>{t.resolutionNote}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Modal com os chamados de um rótulo clicado - mesmos dados já buscados no
 * resumo, sem chamada nova. Mesmo padrão visual do modal de editar
 * agendamento (Schedule.tsx): fundo escurecido, card centralizado, X fecha.
 * Lista com teto de altura + scroll próprio - com muitos chamados no rótulo,
 * o modal nao cresce sem limite, só rola por dentro.
 */
function TicketsModal({ label, tickets, onClose }: { label: string; tickets: TicketDetail[]; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,7,13,0.78)", display: "grid", placeItems: "center", padding: 20 }}
    >
      <Card
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 22, width: "min(560px, 94vw)", maxHeight: "min(600px, 82vh)", display: "flex", flexDirection: "column", background: T.bg1 }}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Chamados</h3>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{label}</p>
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
        <div className="flex flex-col gap-2" style={{ overflowY: "auto" }}>
          {tickets.length === 0 ? (
            <p style={{ fontSize: 12, color: T.muted, padding: "4px 0" }}>Nenhum chamado encontrado pra esse rótulo.</p>
          ) : (
            tickets.map((t) => <TicketDetailCard key={t.number} t={t} />)
          )}
        </div>
      </Card>
    </div>
  );
}

/** Dias em aberto desde a abertura - calculado no momento da renderização (nao no instante em que o cache foi montado), pra sempre refletir o aging real. */
function agingLabel(openedAt: string): string {
  const opened = new Date(openedAt.replace(" ", "T")).getTime();
  if (Number.isNaN(opened)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - opened) / 86400000));
  return `${days} dia${days === 1 ? "" : "s"} em aberto`;
}

function OverflowTicketCard({ t, pastMonth }: { t: OverflowTicket; pastMonth: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = t.description.length > DESCRIPTION_PREVIEW_LEN;
  const shown = expanded || !isLong ? t.description : `${t.description.slice(0, DESCRIPTION_PREVIEW_LEN)}…`;

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <TicketNumberLink number={t.number} url={t.url} />
        {t.resolved ? (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#34d399", background: "#34d39918", padding: "2px 8px", borderRadius: 99 }}>
            Resolvido em {t.closedAt.slice(0, 16)}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#f87171", background: "#f8717118", padding: "2px 8px", borderRadius: 99 }}>
            {/* aging ate HOJE nao faz sentido pra mes passado - la o que vale e "estava aberto no fim do mes" */}
            {pastMonth ? "Aberto no fim do mês" : agingLabel(t.openedAt)}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4, marginBottom: isLong ? 4 : 8 }}>{shown}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          {expanded ? "Ver menos" : "Ver texto completo"}
        </button>
      )}
      <div className="flex items-center gap-4" style={{ fontSize: 11.5, color: T.muted, flexWrap: "wrap" }}>
        <span>
          Sintoma: <span style={{ color: T.sub }}>{t.sintoma}</span>
        </span>
        <span>
          Aberto por: <span style={{ color: T.sub }}>{t.requester}</span>
        </span>
        <span>
          Atendendo: <span style={{ color: T.sub }}>{t.assignedTo}</span>
        </span>
      </div>
    </div>
  );
}

/** Mesmo padrão visual do TicketsModal - card centralizado, fundo escurecido, lista com scroll próprio. */
function OverflowModal({ tickets, pastMonth, monthLabel, onClose }: { tickets: OverflowTicket[]; pastMonth: boolean; monthLabel: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,7,13,0.78)", display: "grid", placeItems: "center", padding: 20 }}
    >
      <Card
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 22, width: "min(560px, 94vw)", maxHeight: "min(600px, 82vh)", display: "flex", flexDirection: "column", background: T.bg1 }}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Chamados em transbordo</h3>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {pastMonth
                ? `De meses anteriores a ${monthLabel} — abertos no fim do mês primeiro, depois os resolvidos dentro dele`
                : "De meses anteriores — ainda abertos primeiro, depois os resolvidos este mês"}
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
        <div className="flex flex-col gap-2" style={{ overflowY: "auto" }}>
          {tickets.length === 0 ? (
            <p style={{ fontSize: 12, color: T.muted, padding: "4px 0" }}>Nenhum chamado em transbordo no momento.</p>
          ) : (
            [...tickets].sort((a, b) => Number(a.resolved) - Number(b.resolved)).map((t) => <OverflowTicketCard key={t.number} t={t} pastMonth={pastMonth} />)
          )}
        </div>
      </Card>
    </div>
  );
}

export function ServiceNow() {
  const [summary, setSummary] = useState<TicketsSummary>(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const [trend, setTrend] = useState<TicketsTrend>(EMPTY_TREND);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(false);
  const [trendFilter, setTrendFilter] = useState(ALL);

  const [melhorias, setMelhorias] = useState<Melhoria[]>([]);
  const [melhoriasLoading, setMelhoriasLoading] = useState(true);
  const [melhoriasError, setMelhoriasError] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [melhoriasOpen, setMelhoriasOpen] = useState(false);

  const [ticketsModal, setTicketsModal] = useState<{ label: string; isAutomation: boolean; tickets: TicketDetail[] } | null>(null);
  const [overflowModalOpen, setOverflowModalOpen] = useState(false);

  // "null" = mes atual (comportamento de sempre). Setado ao clicar num ponto
  // do grafico de tendencia - ver handleTrendClick.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthSummaryLoading, setMonthSummaryLoading] = useState(false);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // So pra forcar o texto "Atualizado há X min" a se recalcular de tempos em
  // tempos - nao busca nada, so re-renderiza com o mesmo lastUpdatedAt.
  const [, setTick] = useState(0);

  const loadAll = useCallback(() => {
    const summaryPromise = serviceNowService
      .getTicketsSummary()
      .then((data) => {
        setSummary(data);
        setSummaryError(false);
      })
      .catch((err) => {
        console.error("Falha ao carregar chamados do ServiceNow:", err);
        setSummaryError(true);
      })
      .finally(() => setSummaryLoading(false));

    const trendPromise = serviceNowService
      .getTicketsTrend()
      .then((data) => {
        setTrend(data);
        setTrendError(false);
      })
      .catch((err) => {
        console.error("Falha ao carregar histórico de chamados do ServiceNow:", err);
        setTrendError(true);
      })
      .finally(() => setTrendLoading(false));

    const melhoriasPromise = serviceNowService
      .getMelhorias()
      .then((data) => {
        setMelhorias(data);
        setMelhoriasError(false);
      })
      .catch((err) => {
        console.error("Falha ao carregar melhorias do ServiceNow:", err);
        setMelhoriasError(true);
      })
      .finally(() => setMelhoriasLoading(false));

    return Promise.allSettled([summaryPromise, trendPromise, melhoriasPromise]).then(() => {
      setLastUpdatedAt(Date.now());
    });
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Busca o resumo completo do mes selecionado (clique no grafico) - so
  // dispara quando "selectedMonth" vira um mes de verdade (nao null, que e
  // "mes atual", ja coberto por loadAll acima). Mes fechado vem do congelado
  // depois da primeira vez (ver monthSummaryStore.ts no backend).
  useEffect(() => {
    if (selectedMonth === null) return;
    let cancelled = false;
    setMonthSummaryLoading(true);
    serviceNowService
      .getMonthSummary(selectedMonth)
      .then((data) => {
        if (!cancelled) setMonthSummary(data);
      })
      .catch((err) => {
        console.error("Falha ao carregar o mês selecionado:", err);
        if (!cancelled) {
          showToast("Não foi possível carregar esse mês.", "error");
          setSelectedMonth(null);
        }
      })
      .finally(() => {
        if (!cancelled) setMonthSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  // Todos os rotulos (automacao + produto) que apareceram em pelo menos um dos 6 meses, pro seletor do gráfico.
  const trendOptions = useMemo(() => {
    const set = new Set<string>();
    trend.months.forEach((m) => {
      m.byAutomation.forEach((c) => set.add(c.label));
      m.byProduct.forEach((c) => set.add(c.label));
    });
    return Array.from(set).sort();
  }, [trend]);

  const trendChartData = useMemo(
    () =>
      trend.months.map((m) => {
        if (trendFilter === ALL) return { mes: m.label, chamados: m.total, month: m.month };
        const match = [...m.byAutomation, ...m.byProduct].find((c) => c.label === trendFilter);
        return { mes: m.label, chamados: match?.count ?? 0, month: m.month };
      }),
    [trend, trendFilter]
  );

  // Ultimo mes da tendencia = mes atual (last6MonthKeys() no backend sempre
  // termina nele) - usado pra saber se o ponto clicado E o mes atual (nesse
  // caso, "selectedMonth" fica null, que ja significa "mes atual").
  const currentMonthKey = trend.months[trend.months.length - 1]?.month ?? null;
  const currentMonthLabel = trend.months[trend.months.length - 1]?.label ?? "mês corrente";

  const handleTrendClick = useCallback(
    (e: { activePayload?: { payload?: { month?: string } }[] } | null) => {
      const month = e?.activePayload?.[0]?.payload?.month;
      if (!month) return;
      setSelectedMonth(month === currentMonthKey ? null : month);
    },
    [currentMonthKey]
  );

  const viewingPastMonth = selectedMonth !== null;

  // Visao unificada do "mes ativo" (corrente ao vivo, ou passado congelado) -
  // o resto da tela le so daqui, sem precisar saber qual das duas fontes foi
  // usada. "overflow"/"secondaryStat" mudam de significado entre as duas (ver
  // MonthSummary em services/serviceNowService.ts).
  const active = useMemo(() => {
    if (viewingPastMonth && monthSummary) {
      return {
        monthLabel: monthSummary.label,
        ticketsThisMonth: monthSummary.ticketsThisMonth,
        secondaryLabel: "Ainda em aberto (desse mês)",
        secondaryValue: monthSummary.stillOpen,
        overflow: { count: monthSummary.ticketsOverflow ?? 0, tickets: monthSummary.overflowTickets ?? [] } as { count: number; tickets: OverflowTicket[] } | null,
        melhorias: monthSummary.melhorias ?? [],
        byAutomation: monthSummary.byAutomation,
        byProduct: monthSummary.byProduct,
        byOrigin: monthSummary.byOrigin,
        byPriority: monthSummary.byPriority,
        needsReview: monthSummary.needsReview,
        tickets: monthSummary.tickets,
        slaCompliance: monthSummary.slaCompliance,
        mttr: monthSummary.mttr,
      };
    }
    return {
      monthLabel: currentMonthLabel,
      ticketsThisMonth: summary.ticketsThisMonth,
      secondaryLabel: "Chamados em atendimento",
      secondaryValue: summary.ticketsInProgress,
      overflow: { count: summary.ticketsOverflow, tickets: summary.overflowTickets },
      melhorias,
      byAutomation: summary.byAutomation,
      byProduct: summary.byProduct,
      byOrigin: summary.byOrigin,
      byPriority: summary.byPriority,
      needsReview: summary.needsReview,
      tickets: summary.tickets,
      slaCompliance: summary.slaCompliance,
      mttr: summary.mttr,
    };
  }, [viewingPastMonth, monthSummary, summary, melhorias, currentMonthLabel]);

  const activeLoading = viewingPastMonth ? monthSummaryLoading : summaryLoading;
  const activeError = viewingPastMonth ? false : summaryError;
  // Melhorias seguem o mes selecionado (mes atual = lista ao vivo; mes passado = reconstruida por datas).
  const melhoriasLoading_ = viewingPastMonth ? monthSummaryLoading : melhoriasLoading;
  const melhoriasError_ = viewingPastMonth ? false : melhoriasError;

  // Transbordo que foi RESOLVIDO no mes (o card conta so os que seguem abertos).
  const overflowResolvedCount = active.overflow ? active.overflow.tickets.filter((t) => t.resolved).length : 0;
  const melhoriasOpenCount = active.melhorias.filter((m) => !m.resolved).length;

  // Proativo (a automacao de deteccao de falha abrindo o chamado sozinha)
  // x reativo (pessoa abriu na mao) - 100% derivado dos chamados ja
  // carregados, sem chamada nova ao ServiceNow.
  const proactiveStats = useMemo(() => computeProactiveStats(active.tickets), [active.tickets]);
  const proactiveChartData = useMemo(
    () => [
      { label: "Proativo", count: proactiveStats.proactive },
      { label: "Reativo", count: proactiveStats.reactive },
    ],
    [proactiveStats]
  );

  const openTicketsModal = (label: string, isAutomation: boolean) => {
    setTicketsModal((cur) => {
      if (cur && cur.isAutomation === isAutomation && cur.label === label) return null;
      const tickets = active.tickets.filter((t) => t.isAutomation === isAutomation && t.label === label);
      return { label, isAutomation, tickets };
    });
  };

  const slaLabel = active.slaCompliance.percentage === null ? "—" : `${active.slaCompliance.percentage}%`;
  const slaTone =
    active.slaCompliance.percentage === null ? T.muted : active.slaCompliance.percentage >= 90 ? "#34d399" : "#fb923c";

  const mttrLabel = active.mttr.avgMinutes === null ? "—" : formatDuration(active.mttr.avgMinutes);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportServiceNowReport({
        summary: {
          ticketsThisMonth: active.ticketsThisMonth,
          secondaryStat: { label: active.secondaryLabel, value: active.secondaryValue },
          overflow: active.overflow ? { ...active.overflow, pastMonth: viewingPastMonth } : null,
          byAutomation: active.byAutomation,
          byProduct: active.byProduct,
          byOrigin: active.byOrigin,
          byPriority: active.byPriority,
          needsReview: active.needsReview,
          tickets: active.tickets,
        },
        monthLabel: active.monthLabel,
        trend,
        melhorias: active.melhorias,
        slaLabel,
        mttrLabel,
      });
      showToast("Relatório exportado com sucesso.", "success");
    } catch (err) {
      console.error("Falha ao exportar relatório do ServiceNow:", err);
      showToast("Não foi possível gerar o relatório. Tenta de novo.", "error");
    } finally {
      setExporting(false);
    }
  }, [active, viewingPastMonth, trend, slaLabel, mttrLabel]);

  return (
    <>
      <RefreshBar
        onRefresh={handleRefresh}
        refreshing={refreshing}
        lastUpdatedAt={lastUpdatedAt}
        leftSlot={
          <ExportButton
            onClick={handleExport}
            exporting={exporting}
            disabled={activeLoading || trendLoading || melhoriasLoading_}
            label="Exportar relatório"
          />
        }
      />
      <div className="flex flex-col gap-5">
      {viewingPastMonth && (
        <div
          className="flex items-center gap-2"
          style={{ padding: "9px 14px", borderRadius: 10, background: `${T.accent}12`, border: `1px solid ${T.accent}40` }}
        >
          <CalendarClock size={14} color={T.accent} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: T.text }}>
            Vendo dados de <strong>{active.monthLabel}</strong>
            {monthSummaryLoading ? " — carregando…" : ""}
          </span>
          <button
            onClick={() => setSelectedMonth(null)}
            className="inline-flex items-center gap-1.5"
            style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <ArrowLeft size={13} /> Voltar pro mês atual
          </button>
        </div>
      )}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {activeLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={Ticket}
              label="Chamados no mês"
              value={activeError ? "—" : active.ticketsThisMonth}
              tone={activeError ? T.muted : "#c084fc"}
            />
            <StatCard
              icon={ClipboardList}
              label={active.secondaryLabel}
              value={activeError ? "—" : active.secondaryValue}
              tone={activeError ? T.muted : "#fb923c"}
            />
            {active.overflow && (
              <StatCard
                icon={History}
                label="Chamados transbordo"
                value={activeError ? "—" : active.overflow.count}
                tone={activeError ? T.muted : "#f87171"}
                caption={
                  (viewingPastMonth ? "Abertos no fim do mês, de meses anteriores" : "Ainda abertos, de meses anteriores") +
                  (overflowResolvedCount > 0
                    ? ` · ${overflowResolvedCount} resolvido${overflowResolvedCount > 1 ? "s" : ""} ${viewingPastMonth ? "no mês" : "este mês"}`
                    : "")
                }
                onClick={activeError ? undefined : () => setOverflowModalOpen(true)}
              />
            )}
            <StatCard
              icon={ShieldCheck}
              label="SLA cumprido"
              value={activeError ? "—" : slaLabel}
              tone={activeError ? T.muted : slaTone}
              caption={!activeError && active.slaCompliance.evaluated > 0 ? `${active.slaCompliance.evaluated} chamados fechados avaliados` : undefined}
            />
            <StatCard
              icon={Clock}
              label="MTTR"
              value={activeError ? "—" : mttrLabel}
              tone={activeError ? T.muted : "#818cf8"}
              caption={!activeError && active.mttr.evaluated > 0 ? `Média de ${active.mttr.evaluated} chamados fechados` : undefined}
            />
          </>
        )}
      </div>

      <Panel title="Chamados nos últimos 6 meses" sub="Volume mensal nas filas de sustentação — clique num ponto pra ver os dados daquele mês">
        {trendLoading ? (
          <ChartSkeleton height={220} />
        ) : (
          <>
            <div className="flex items-center justify-end" style={{ marginBottom: 10 }}>
              <select
                value={trendFilter}
                onChange={(e) => setTrendFilter(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, color: T.text, background: T.surface, border: `1px solid ${T.border}`, outline: "none" }}
              >
                {/* cor de fundo explicita nas <option> - sem isso o navegador usa
                    fundo branco padrao pro dropdown aberto, e o texto claro do
                    tema escuro fica ilegivel por falta de contraste */}
                <option value={ALL} style={{ background: T.bg1, color: T.text }}>Todos</option>
                {trendOptions.map((o) => (
                  <option key={o} value={o} style={{ background: T.bg1, color: T.text }}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            {trendError ? (
              <p style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Não foi possível carregar o histórico agora.</p>
            ) : (
              <div style={{ cursor: "pointer" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendChartData} margin={{ left: -18, right: 6 }} onClick={handleTrendClick}>
                    <defs>
                      <linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accent} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="mes" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTip} />
                    <Area type="monotone" dataKey="chamados" stroke={T.accent} strokeWidth={2} fill="url(#gTrend)" activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Panel>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Panel title="Chamados por automação" sub="Sintoma dos chamados do mês — clique numa barra pra ver os chamados">
          {activeLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton height={16} />
              <Skeleton height={16} />
              <Skeleton height={16} />
            </div>
          ) : (
            <CategoryBars
              items={active.byAutomation}
              color={T.accent}
              labelWidth={220}
              selected={ticketsModal?.isAutomation ? ticketsModal.label : null}
              onSelect={(l) => openTicketsModal(l, true)}
            />
          )}
        </Panel>

        <Panel title="Chamados por produto" sub="Subcategoria — Sintoma dos chamados do mês — clique numa barra pra ver os chamados">
          {activeLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton height={16} />
              <Skeleton height={16} />
              <Skeleton height={16} />
            </div>
          ) : (
            <CategoryBars
              items={active.byProduct}
              color="#c084fc"
              labelWidth={280}
              selected={ticketsModal && !ticketsModal.isAutomation ? ticketsModal.label : null}
              onSelect={(l) => openTicketsModal(l, false)}
            />
          )}
        </Panel>
      </div>

      {ticketsModal && (
        <TicketsModal label={ticketsModal.label} tickets={ticketsModal.tickets} onClose={() => setTicketsModal(null)} />
      )}

      {overflowModalOpen && active.overflow && (
        <OverflowModal tickets={active.overflow.tickets} pastMonth={viewingPastMonth} monthLabel={active.monthLabel} onClose={() => setOverflowModalOpen(false)} />
      )}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Panel title="Distribuição por origem" sub="Incidente × Solicitação × Problema — chamados do mês">
          {activeLoading ? (
            <ChartSkeleton height={220} />
          ) : active.byOrigin.length === 0 ? (
            <p style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Nenhum chamado identificado esse mês.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={active.byOrigin}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke={T.bg1}
                  strokeWidth={2}
                >
                  {active.byOrigin.map((entry) => (
                    <Cell key={entry.label} fill={ORIGIN_COLORS[entry.label] ?? T.muted} />
                  ))}
                </Pie>
                <Tooltip {...chartTip} />
                <Legend wrapperStyle={{ fontSize: 12, color: T.sub }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Chamados proativos × reativos" sub="Aberto pela automação de detecção de falha × aberto por uma pessoa">
          {activeLoading ? (
            <ChartSkeleton height={220} />
          ) : proactiveStats.total === 0 ? (
            <p style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Nenhum chamado identificado esse mês.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={proactiveChartData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke={T.bg1}
                    strokeWidth={2}
                  >
                    {proactiveChartData.map((entry) => (
                      <Cell key={entry.label} fill={PROACTIVE_COLORS[entry.label] ?? T.muted} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: T.sub }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-5" style={{ marginTop: 2 }}>
                <span style={{ fontSize: 12, color: T.sub }}>
                  Proativo: <strong style={{ color: T.text }}>{proactiveStats.proactivePct}%</strong>
                </span>
                <span style={{ fontSize: 12, color: T.sub }}>
                  Reativo: <strong style={{ color: T.text }}>{proactiveStats.reactivePct}%</strong>
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Chamados por prioridade" sub="Escala padrão do ServiceNow — chamados do mês">
          {activeLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton height={16} />
              <Skeleton height={16} />
              <Skeleton height={16} />
            </div>
          ) : (
            <CategoryBars items={active.byPriority} color="#818cf8" labelWidth={140} />
          )}
        </Panel>
      </div>

      <Panel
        title="Chamados para revisar"
        sub="Sintoma genérico ('Não informado'/'Outro') ou Subcategoria vazia"
        collapsible
        open={reviewOpen}
        onToggle={() => setReviewOpen((o) => !o)}
        right={
          activeLoading ? (
            <Skeleton width={28} height={20} radius={99} />
          ) : (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#fb923c", background: "#fb923c1f", padding: "2px 8px", borderRadius: 99 }}>
              {active.needsReview.length}
            </span>
          )
        }
      >
        {activeLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton height={70} radius={10} />
            <Skeleton height={70} radius={10} />
          </div>
        ) : active.needsReview.length === 0 ? (
          <div className="flex items-center gap-2" style={{ padding: "8px 0", color: T.muted, fontSize: 12 }}>
            <HelpCircle size={14} />
            Nenhum chamado do mês precisa de revisão.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.needsReview.map((item) => (
              <ReviewItemCard key={item.number} item={item} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Melhorias"
        sub={
          viewingPastMonth
            ? `Melhorias em aberto no fim de ${active.monthLabel} (qualquer mês de abertura) — e as resolvidas dentro dele, no fim da lista`
            : "Chamados com qualificação de sintoma 'Melhoria' em aberto (qualquer mês) — e os resolvidos este mês, no fim da lista"
        }
        collapsible
        open={melhoriasOpen}
        onToggle={() => setMelhoriasOpen((o) => !o)}
        right={
          melhoriasLoading_ ? (
            <Skeleton width={28} height={20} radius={99} />
          ) : (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.accent, background: `${T.accent}1f`, padding: "2px 8px", borderRadius: 99 }}>
              {melhoriasOpenCount}
            </span>
          )
        }
      >
        {melhoriasLoading_ ? (
          <div className="flex flex-col gap-2">
            <Skeleton height={70} radius={10} />
            <Skeleton height={70} radius={10} />
          </div>
        ) : melhoriasError_ ? (
          <p style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Não foi possível carregar as melhorias agora.</p>
        ) : active.melhorias.length === 0 ? (
          <div className="flex items-center gap-2" style={{ padding: "8px 0", color: T.muted, fontSize: 12 }}>
            <Sparkles size={14} />
            {viewingPastMonth ? "Nenhuma melhoria aberta ou resolvida nesse mês." : "Nenhuma melhoria em aberto no momento."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.melhorias.map((m) => (
              <MelhoriaCard key={m.number} m={m} />
            ))}
          </div>
        )}
      </Panel>
      </div>
    </>
  );
}
