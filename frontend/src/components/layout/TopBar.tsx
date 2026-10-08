import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Menu } from "lucide-react";
import { T, glass, mono } from "../../constants/theme";
import { HealthDot } from "../ui/HealthBadge";
import { robotShortCode } from "../../utils/robotCode";
import type { Robot } from "../../types";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/robots": "Robôs",
  "/schedule": "Schedule",
  "/alerts": "Alertas",
  "/servicenow": "ServiceNow",
};

interface TopBarProps {
  robots: Robot[];
  query: string;
  setQuery: (q: string) => void;
  openRobot: (id: string) => void;
  onToggleNav: () => void;
}

export function TopBar({ robots, query, setQuery, openRobot, onToggleNav }: TopBarProps) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Painel Sustentação RPA";

  // Separado do "query" de proposito: query continua vivo (Robots.tsx usa ele
  // pra filtrar a tabela mesmo depois de fechar esse dropdown), so o dropdown
  // em si que fecha ao clicar fora.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results =
    query.length > 1
      ? robots
          .filter((r) =>
            [r.id, r.name, r.area, r.machine, r.developer, r.lastError, ...r.pendencies.map((p) => p.text)]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())
          )
          .slice(0, 6)
      : [];

  return (
    <header
      className="flex items-center gap-4"
      style={{ position: "sticky", top: 0, zIndex: 30, padding: "14px 22px", borderBottom: `1px solid ${T.border}`, background: "rgba(9,13,21,0.7)", backdropFilter: "blur(14px)" }}
    >
      <button
        onClick={onToggleNav}
        className="md:hidden"
        style={{ color: T.sub, background: "none", border: "none", borderRadius: 8, cursor: "pointer", padding: 4, transition: "color 0.15s, background 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.sub; e.currentTarget.style.background = "none"; }}
      >
        <Menu size={20} />
      </button>
      <h1 style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{title}</h1>

      <div ref={searchRef} style={{ position: "relative", marginLeft: "auto", width: "min(360px, 42vw)" }}>
        <Search size={15} color={T.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
          onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.surfaceHi; setDropdownOpen(true); }}
          onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}
          placeholder="Busca global: robô, código, ticket, stack trace…"
          style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, fontSize: 12.5, color: T.text, outline: "none", background: T.surface, border: `1px solid ${T.border}`, transition: "border-color 0.15s, background 0.15s" }}
        />
        {dropdownOpen && results.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, ...glass, background: T.bg1, padding: 6, zIndex: 50 }}>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  openRobot(r.id);
                  setQuery("");
                  setDropdownOpen(false);
                }}
                className="flex items-center gap-3"
                style={{ width: "100%", padding: "9px 10px", borderRadius: 8, cursor: "pointer", background: "none", border: "none", textAlign: "left", transition: "background 0.12s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHi)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ flexShrink: 0 }}><HealthDot fails={r.fails} /></span>
                <span style={{ fontFamily: mono, fontSize: 12, color: T.accent, flexShrink: 0 }}>{robotShortCode(r.name, r.id)}</span>
                <span style={{ fontSize: 12.5, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{r.machine}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
