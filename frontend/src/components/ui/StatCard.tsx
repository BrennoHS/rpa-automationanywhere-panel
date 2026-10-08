import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "./Card";
import { T, mono } from "../../constants/theme";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: string;
  up?: boolean;
  /** Legenda neutra abaixo do valor (sem ícone/cor de tendência) - pra contexto tipo "38 chamados avaliados", diferente de "delta" que é sempre uma variação (sobe/desce). */
  caption?: string;
  tone?: string;
  /** Quando presente, o card vira clicável (cursor pointer) - usar pra abrir um modal/drill-down com o detalhe por trás do número. */
  onClick?: () => void;
}

export function StatCard({ icon: Icon, label, value, delta, up, caption, tone = T.accent, onClick }: StatCardProps) {
  return (
    <Card
      onClick={onClick}
      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, cursor: onClick ? "pointer" : "default", transition: "background 0.15s, border-color 0.15s, transform 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: T.sub, fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: `${tone}1f`, border: `1px solid ${tone}33` }}>
          <Icon size={17} color={tone} />
        </span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: T.text, lineHeight: 1 }}>{value}</div>
      {delta && (
        <div className="flex items-center gap-1" style={{ fontSize: 12, color: up ? "#34d399" : "#f87171" }}>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {delta}
        </div>
      )}
      {caption && <div style={{ fontSize: 11.5, color: T.muted }}>{caption}</div>}
    </Card>
  );
}
