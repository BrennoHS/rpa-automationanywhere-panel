import { NavLink } from "react-router-dom";
import { LayoutDashboard, Bot, CalendarClock, Bell, Workflow, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { T, mono } from "../../constants/theme";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  key?: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/robots", label: "Robôs", icon: Bot },
  { to: "/schedule", label: "Schedule", icon: CalendarClock },
  { to: "/alerts", label: "Alertas", icon: Bell, key: "alerts" },
  { to: "/servicenow", label: "ServiceNow", icon: Ticket },
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
  alertCount: number;
}

export function Sidebar({ open, onNavigate, alertCount }: SidebarProps) {
  return (
    <aside
      className={`${open ? "flex" : "hidden"} md:flex fixed md:sticky inset-y-0 left-0 md:top-0 md:bottom-auto z-40 flex-col`}
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        background: "rgba(9,13,21,0.92)",
        height: "100vh",
      }}
    >
      <div style={{ padding: "22px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2.5">
          <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, boxShadow: `0 4px 14px -4px ${T.accent}66` }}>
            <Workflow size={18} color={T.bg0} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: T.text, lineHeight: 1.25, minWidth: 0, overflowWrap: "break-word" }}>
            Painel Sustentação<br />RPA
          </div>
        </div>
      </div>

      <nav style={{ padding: 12, flex: 1 }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={onNavigate}
            className="flex items-center gap-3"
            style={({ isActive }) => ({
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              marginBottom: 4,
              cursor: "pointer",
              textDecoration: "none",
              color: isActive ? T.text : T.sub,
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 500,
              background: isActive ? T.surfaceHi : "transparent",
              border: `1px solid ${isActive ? T.border : "transparent"}`,
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.surfaceHi;
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.text;
            }}
            onMouseLeave={(e) => {
              const active = e.currentTarget.getAttribute("aria-current") === "page";
              e.currentTarget.style.background = active ? T.surfaceHi : "transparent";
              e.currentTarget.style.borderColor = active ? T.border : "transparent";
              e.currentTarget.style.color = active ? T.text : T.sub;
            }}
          >
            {({ isActive }) => (
              <>
                <n.icon size={17} color={isActive ? T.accent : T.sub} />
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.key === "alerts" && alertCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "#f8717120", padding: "1px 7px", borderRadius: 99, fontFamily: mono }}>
                    {alertCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: 16, borderTop: `1px solid ${T.border}` }}>
        <div
          className="flex items-center gap-2.5"
          style={{ padding: "8px 10px", borderRadius: 10, background: T.surface, border: "1px solid transparent", transition: "background 0.15s, border-color 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.border; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = "transparent"; }}
        >
          <span style={{ width: 30, height: 30, borderRadius: 99, background: `linear-gradient(135deg,${T.accent2},${T.accent})`, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: T.bg0 }}>
            RP
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Equipe RPA</div>
            <div style={{ fontSize: 10, color: T.muted }}>Suporte · Dev</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
