import { CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RobotStatus } from "../types";

export const STATUS: Record<RobotStatus, { color: string; icon: LucideIcon }> = {
  Ativo: { color: "#34d399", icon: CheckCircle2 },
  Pausado: { color: "#94a3b8", icon: PauseCircle },
  Erro: { color: "#f87171", icon: XCircle },
};
