import { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RobotDetail } from "../../pages/RobotDetail";
import { useRobots } from "../../hooks/useRobots";
import type { AppContextValue } from "../../hooks/useApp";
import { T } from "../../constants/theme";
import { ToastHost } from "../ui";

export function AppShell() {
  const { robots, loading, updatePendencies, setMonitored, refresh } = useRobots();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  const selected = robots.find((r) => r.id === selectedId) ?? null;
  // Mesmo criterio "critico" usado em Alerts.tsx (status "Erro" ou 7+ falhas) - sem
  // "+1" fixo (era pra contar um alerta de ServiceNow hardcoded que foi removido).
  const alertCount = robots.filter((r) => r.status === "Erro" || r.fails >= 7).length;

  const ctx: AppContextValue = useMemo(
    () => ({ robots, loading, query, setQuery, openRobot: setSelectedId, updatePendencies, setMonitored, refresh }),
    [robots, loading, query, updatePendencies, setMonitored, refresh]
  );

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        color: T.text,
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 15% -5%, rgba(34,211,238,0.08), transparent 60%),
                     radial-gradient(1000px 500px at 100% 0%, rgba(129,140,248,0.07), transparent 55%),
                     linear-gradient(160deg, ${T.bg0}, ${T.bg1})`,
      }}
    >
      <div className="flex" style={{ minHeight: "100vh" }}>
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} alertCount={alertCount} />

        <main style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>
          <TopBar
            robots={robots}
            query={query}
            setQuery={setQuery}
            openRobot={setSelectedId}
            onToggleNav={() => setNavOpen((o) => !o)}
          />
          <div style={{ padding: 22, maxWidth: 1320, margin: "0 auto" }}>
            <Outlet context={ctx} />
          </div>
        </main>
      </div>

      {selected && (
        <RobotDetail
          robot={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={updatePendencies}
          onToggleMonitor={setMonitored}
        />
      )}

      <ToastHost />
    </div>
  );
}
