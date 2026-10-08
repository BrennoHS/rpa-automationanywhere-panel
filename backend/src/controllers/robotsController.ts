import { Request, Response } from "express";
import { automationAnywhereService } from "../services/automationAnywhereService";
import { serviceNowService } from "../services/serviceNowService";

export async function getRobots(_req: Request, res: Response) {
  try {
    const robots = await automationAnywhereService.listRobots();
    res.json(robots);
  } catch (err) {
    console.error("[GET /robots]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getRobotById(req: Request, res: Response) {
  try {
    const robot = await automationAnywhereService.getRobot(req.params.id);
    if (!robot) {
      return res.status(404).json({ message: "Robô não encontrado" });
    }
    res.json(robot);
  } catch (err) {
    console.error(`[GET /robots/${req.params.id}]`, err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getRobotRuns(req: Request, res: Response) {
  try {
    const runs = await automationAnywhereService.getRobotRuns(req.params.id);
    res.json(runs);
  } catch (err) {
    console.error(`[GET /robots/${req.params.id}/runs]`, err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function setRobotMonitored(req: Request, res: Response) {
  try {
    const { monitored } = req.body as { monitored?: unknown };
    if (typeof monitored !== "boolean") {
      return res.status(400).json({ message: "Campo 'monitored' precisa ser true/false" });
    }
    await automationAnywhereService.setRobotMonitored(req.params.id, monitored);
    res.json({ id: req.params.id, monitored });
  } catch (err) {
    console.error(`[PATCH /robots/${req.params.id}/monitor]`, err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getTicketsSummary(_req: Request, res: Response) {
  try {
    const summary = await serviceNowService.getTicketsSummary();
    res.json(summary);
  } catch (err) {
    console.error("[GET /servicenow/tickets/summary]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getTicketsTrend(_req: Request, res: Response) {
  try {
    const trend = await serviceNowService.getTicketsTrend();
    res.json(trend);
  } catch (err) {
    console.error("[GET /servicenow/tickets/trend]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getMonthSummary(req: Request, res: Response) {
  try {
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Parâmetro 'month' precisa estar no formato 'YYYY-MM'" });
    }
    const summary = await serviceNowService.getMonthSummary(month);
    res.json(summary);
  } catch (err) {
    console.error(`[GET /servicenow/tickets/summary/${req.params.month}]`, err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getMelhorias(_req: Request, res: Response) {
  try {
    const melhorias = await serviceNowService.getMelhorias();
    res.json(melhorias);
  } catch (err) {
    console.error("[GET /servicenow/melhorias]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getActivitySnapshot(_req: Request, res: Response) {
  try {
    const snapshot = await automationAnywhereService.getActivitySnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("[GET /activity/snapshot]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getRecentFailures(req: Request, res: Response) {
  try {
    const log = await automationAnywhereService.getRecentFailures(Number(req.query.hours) || 24);
    res.json(log);
  } catch (err) {
    console.error("[GET /activity/failures]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}
