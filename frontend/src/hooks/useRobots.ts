import { useEffect, useState, useCallback } from "react";
import type { Robot, Pendency } from "../types";
import { automationAnywhereService } from "../services/automationAnywhereService";
import { showToast } from "../utils/toast";

/** Carrega e mantem o estado da frota de robos. */
export function useRobots() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await automationAnywhereService.getRobots();
    setRobots(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatePendencies = useCallback((robotId: string, pendencies: Pendency[]) => {
    setRobots((prev) =>
      prev.map((r) => (r.id === robotId ? { ...r, pendencies } : r))
    );
  }, []);

  const setMonitored = useCallback((robotId: string, monitored: boolean) => {
    setRobots((prev) => prev.map((r) => (r.id === robotId ? { ...r, monitored } : r)));
    automationAnywhereService
      .setMonitored(robotId, monitored)
      .then(() => {
        showToast(monitored ? "Monitoramento ativado — o time será avisado no Teams se esse robô falhar." : "Monitoramento desativado.", "success");
      })
      .catch((err) => {
        console.error("Falha ao salvar monitoramento", err);
        setRobots((prev) => prev.map((r) => (r.id === robotId ? { ...r, monitored: !monitored } : r)));
        showToast("Não foi possível salvar o monitoramento. Tenta de novo.", "error");
      });
  }, []);

  return { robots, loading, updatePendencies, setMonitored, refresh: load };
}
