import { healthOf } from "../../utils/health";

export function HealthDot({ fails, size = 9 }: { fails: number; size?: number }) {
  const h = healthOf(fails);
  return (
    <span
      title={h.label}
      style={{ width: size, height: size, borderRadius: 99, background: h.color, boxShadow: `0 0 10px ${h.color}aa`, display: "inline-block" }}
    />
  );
}

export function HealthBadge({ fails }: { fails: number }) {
  const h = healthOf(fails);
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: h.color, background: `${h.color}1a`, border: `1px solid ${h.color}44`, whiteSpace: "nowrap" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: h.color }} />
      {h.label} · {10 - fails}/10
    </span>
  );
}
