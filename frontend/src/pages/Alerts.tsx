import { useMemo } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, Skeleton } from "../components/ui";
import { T } from "../constants/theme";
import { robotShortCode } from "../utils/robotCode";
import { useApp } from "../hooks/useApp";
import type { Robot } from "../types";

type Severity = "crit" | "warn" | "info";
interface Alert {
  sev: Severity;
  title: string;
  desc: string;
  r: Robot;
}

const META: Record<Severity, { c: string; l: string }> = {
  crit: { c: "#f87171", l: "Crítico" },
  warn: { c: "#fb923c", l: "Atenção" },
  info: { c: "#818cf8", l: "Informativo" },
};

export function Alerts() {
  const { robots, loading, openRobot } = useApp();

  // Todo alerta aqui vem de dado real do robo (status/fails/maxT), sem excecao -
  // nao tem mais nenhuma linha fixa/hardcoded (tinha um alerta fixo de "ServiceNow
  // indisponivel" antes, tirado de proposito - so dado real daqui pra frente).
  const alerts = useMemo<Alert[]>(() => {
    const a: Alert[] = [];
    robots.forEach((r) => {
      if (r.status === "Erro") a.push({ sev: "crit", title: "Robô em estado de erro", desc: r.lastError, r });
      if (r.fails >= 7) a.push({ sev: "crit", title: "Falhas recorrentes", desc: `${r.fails} falhas nas últimas 10 execuções`, r });
      else if (r.fails >= 4) a.push({ sev: "warn", title: "Instabilidade detectada", desc: `${r.fails} falhas recentes — monitorar`, r });
      if (r.status === "Pausado") a.push({ sev: "info", title: "Robô pausado", desc: "Sem execução agendada ativa", r });
      if (r.maxT > 18) a.push({ sev: "warn", title: "Timeout elevado", desc: `Tempo máximo de ${r.maxT} min registrado`, r });
    });
    const order: Record<Severity, number> = { crit: 0, warn: 1, info: 2 };
    return a.sort((x, y) => order[x.sev] - order[y.sev]);
  }, [robots]);

  const counts: Record<Severity, number> = {
    crit: alerts.filter((a) => a.sev === "crit").length,
    warn: alerts.filter((a) => a.sev === "warn").length,
    info: alerts.filter((a) => a.sev === "info").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {(Object.entries(META) as [Severity, { c: string; l: string }][]).map(([k, v]) => (
          <Card key={k} style={{ padding: 18, borderLeft: `3px solid ${v.c}` }}>
            <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{v.l}</div>
            {loading ? (
              <Skeleton width={40} height={26} style={{ marginTop: 6 }} />
            ) : (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: v.c, marginTop: 6 }}>{counts[k]}</div>
            )}
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={`sk-${i}`} height={62} radius={12} />)}
        {!loading && alerts.map((a, i) => {
          const v = META[a.sev];
          return (
            <Card key={i} onClick={() => openRobot(a.r.id)} style={{ padding: 15, cursor: "pointer", borderLeft: `3px solid ${v.c}`, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: `${v.c}1a`, border: `1px solid ${v.c}3a` }}>
                <AlertTriangle size={17} color={v.c} />
              </span>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{a.title}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: T.accent }}>{robotShortCode(a.r.name, a.r.id)}</span>
                </div>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{a.desc}</div>
              </div>
              <ChevronRight size={16} color={T.muted} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
