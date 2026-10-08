import { useOutletContext } from "react-router-dom";
import type { Robot, Pendency } from "../types";

/** Contexto compartilhado entre as paginas via <Outlet />. */
export interface AppContextValue {
  robots: Robot[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  openRobot: (id: string) => void;
  updatePendencies: (robotId: string, pendencies: Pendency[]) => void;
  setMonitored: (robotId: string, monitored: boolean) => void;
  refresh: () => Promise<void>;
}

export const useApp = () => useOutletContext<AppContextValue>();
