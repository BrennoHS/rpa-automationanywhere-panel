import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, ChevronRight, ChevronLeft } from "lucide-react";
import { Card, HealthBadge, StatusChip, Skeleton } from "../components/ui";
import { T, mono } from "../constants/theme";
import { HEALTH, healthOf } from "../utils/health";
import { formatDateTime } from "../utils/datetime";
import { robotShortCode } from "../utils/robotCode";
import { useApp } from "../hooks/useApp";
import type { Robot } from "../types";

type SortKey = keyof Robot | "health";

export function Robots() {
  const { robots, loading, query, openRobot } = useApp();
  // suporta chegar aqui com filtro de saude pre-aplicado via link do
  // Dashboard (?health=critical, por exemplo, vindo do painel "Saude da
  // frota") - so no carregamento inicial, nao fica sincronizando depois.
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Todos");
  const [health, setHealth] = useState(() => {
    const fromUrl = searchParams.get("health");
    return fromUrl && HEALTH.some((h) => h.key === fromUrl) ? fromUrl : "Todos";
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "id", dir: 1 });

  const scrollTopRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [needsHScroll, setNeedsHScroll] = useState(false);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = robots.filter((x) => {
      const hit = !q || [x.id, x.name, x.area, x.machine, x.developer, x.lastError].join(" ").toLowerCase().includes(q);
      const sOk = status === "Todos" || x.status === status;
      const hOk = health === "Todos" || healthOf(x.fails).key === health;
      return hit && sOk && hOk;
    });
    filtered.sort((a, b) => {
      const va = sort.key === "health" ? a.fails : (a[sort.key] as string | number);
      const vb = sort.key === "health" ? b.fails : (b[sort.key] as string | number);
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
    return filtered;
  }, [robots, query, status, health, sort]);

  // Paginacao 100% no cliente - a lista inteira ja esta em memoria (o ambiente
  // real tem ~45 robos, nada que justifique busca/pagina server-side). So
  // divide "rows" (ja filtrado/ordenado) em paginas de PAGE_SIZE.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, status, health]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // barra de rolagem espelhada no topo da tabela: so aparece se o conteudo
  // realmente ultrapassar a largura visivel, pra nao precisar descer a pagina
  // toda pra achar o scroll horizontal.
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const update = () => {
      setScrollWidth(el.scrollWidth);
      setNeedsHScroll(el.scrollWidth > el.clientWidth + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageRows]);

  const syncFromTop = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollBodyRef.current) scrollBodyRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };
  const syncFromBody = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollTopRef.current) scrollTopRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  const th = (label: string, key: SortKey | null) => (
    <th
      onClick={() => key && setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
      style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.sub, textTransform: "uppercase", letterSpacing: 0.4, cursor: key ? "pointer" : "default", whiteSpace: "nowrap", transition: "color 0.15s" }}
      onMouseEnter={(e) => { if (key) e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; }}
    >
      {label}
      {sort.key === key && <span style={{ color: T.accent }}>{sort.dir > 0 ? " ↑" : " ↓"}</span>}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["Todos", "Ativo", "Pausado", "Erro"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", color: status === s ? T.bg0 : T.sub, background: status === s ? T.accent : T.surface, border: `1px solid ${status === s ? T.accent : T.border}`, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { if (status === s) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (status === s) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.sub; }}
          >
            {s}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
        <Filter size={14} color={T.muted} />
        {[["Todos", "Todos"], ...HEALTH.map((h) => [h.key, h.label])].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setHealth(k)}
            style={{ padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: "pointer", color: health === k ? T.text : T.muted, background: health === k ? T.surfaceHi : "transparent", border: `1px solid ${health === k ? T.borderHi : "transparent"}`, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { if (health === k) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; }}
            onMouseLeave={(e) => { if (health === k) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.muted; }}
          >
            {l}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, color: T.muted }}>
          {loading ? <Skeleton width={54} height={12} style={{ display: "inline-block" }} /> : `${rows.length} robôs`}
        </span>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {needsHScroll && (
          <div
            ref={scrollTopRef}
            onScroll={syncFromTop}
            style={{ overflowX: "auto", overflowY: "hidden", height: 14 }}
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
        )}
        <div ref={scrollBodyRef} onScroll={syncFromBody} style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead style={{ background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
              <tr>
                {th("ID", "id")}
                {th("Robô", "name")}
                {th("Status", "status")}
                {th("Máquina", "machine")}
                {th("Runner", "developer")}
                {th("Última exec.", null)}
                {th("Saúde", "health")}
                {th("", null)}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {Array.from({ length: 8 }).map((_, c) => (
                      <td key={c} style={{ padding: "11px 12px" }}>
                        <Skeleton height={13} width={c === 7 ? 16 : undefined} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && pageRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openRobot(r.id)}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "11px 12px", fontFamily: mono, color: T.accent, fontSize: 13 }}>{robotShortCode(r.name, r.id)}</td>
                  <td style={{ padding: "11px 12px", color: T.text, fontSize: 13, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "11px 12px" }}><StatusChip status={r.status} /></td>
                  <td style={{ padding: "11px 12px", fontFamily: mono, color: T.sub, fontSize: 12 }}>{r.machine}</td>
                  <td style={{ padding: "11px 12px", color: T.sub, fontSize: 13 }}>{r.developer}</td>
                  <td style={{ padding: "11px 12px", color: T.muted, fontSize: 12, fontFamily: mono, whiteSpace: "nowrap" }}>{formatDateTime(r.lastExec)}</td>
                  <td style={{ padding: "11px 12px" }}><HealthBadge fails={r.fails} /></td>
                  <td style={{ padding: "11px 12px", color: T.muted }}><ChevronRight size={16} /></td>
                </tr>
              ))}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: "center", color: T.muted }}>
                    Nenhum robô encontrado. Ajuste a busca ou os filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div
            className="flex items-center justify-between flex-wrap gap-2"
            style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}` }}
          >
            <span style={{ fontSize: 11.5, color: T.muted }}>
              Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} de {rows.length} robôs
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1"
                style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: safePage <= 1 ? "default" : "pointer", color: safePage <= 1 ? T.muted : T.sub, background: T.surface, border: `1px solid ${T.border}`, opacity: safePage <= 1 ? 0.5 : 1, transition: "background 0.15s, color 0.15s, border-color 0.15s" }}
                onMouseEnter={(e) => { if (safePage <= 1) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.borderHi; }}
                onMouseLeave={(e) => { if (safePage <= 1) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; e.currentTarget.style.borderColor = T.border; }}
              >
                <ChevronLeft size={13} /> Anterior
              </button>
              <span style={{ fontSize: 11.5, color: T.sub, fontFamily: mono, minWidth: 56, textAlign: "center" }}>
                {safePage} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                className="inline-flex items-center gap-1"
                style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: safePage >= pageCount ? "default" : "pointer", color: safePage >= pageCount ? T.muted : T.sub, background: T.surface, border: `1px solid ${T.border}`, opacity: safePage >= pageCount ? 0.5 : 1, transition: "background 0.15s, color 0.15s, border-color 0.15s" }}
                onMouseEnter={(e) => { if (safePage >= pageCount) return; e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.borderHi; }}
                onMouseLeave={(e) => { if (safePage >= pageCount) return; e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.sub; e.currentTarget.style.borderColor = T.border; }}
              >
                Próxima <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
