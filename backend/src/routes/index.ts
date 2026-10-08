import { Router } from "express";
import robotsRoutes from "./robots.routes";
import scheduleRoutes from "./schedule.routes";
import { env } from "../config/env";
import { getCallStats, resetCallStats } from "../services/callLog";
import { getTicketsSummary, getTicketsTrend, getMonthSummary, getMelhorias, getActivitySnapshot, getRecentFailures } from "../controllers/robotsController";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
router.use("/robots", robotsRoutes);
router.use("/schedule", scheduleRoutes);
router.get("/servicenow/tickets/summary", getTicketsSummary);
router.get("/servicenow/tickets/summary/:month", getMonthSummary);
router.get("/servicenow/tickets/trend", getTicketsTrend);
router.get("/servicenow/melhorias", getMelhorias);
router.get("/activity/snapshot", getActivitySnapshot);
router.get("/activity/failures", getRecentFailures);

// Contagem de chamadas ao Control Room / ServiceNow / backend - ver services/callLog.ts.
router.get("/debug/calls", (_req, res) => {
  if (!env.logCalls) return res.status(404).json({ message: "LOG_CALLS=false - log de chamadas desligado" });
  res.json(getCallStats());
});
router.get("/debug/calls/reset", (_req, res) => {
  resetCallStats();
  res.json({ ok: true });
});

export default router;
