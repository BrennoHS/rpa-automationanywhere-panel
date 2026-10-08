import { STATUS } from "../../utils/status";
import type { RobotStatus } from "../../types";

export function StatusChip({ status }: { status: RobotStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}3a` }}
    >
      <Icon size={12} /> {status}
    </span>
  );
}
