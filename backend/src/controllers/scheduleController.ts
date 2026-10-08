import { Request, Response } from "express";
import { automationAnywhereService } from "../services/automationAnywhereService";

export async function getSchedule(_req: Request, res: Response) {
  try {
    const schedule = await automationAnywhereService.getSchedule();
    res.json(schedule);
  } catch (err) {
    console.error("[GET /schedule]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}

export async function getScheduleSummary(_req: Request, res: Response) {
  try {
    const summary = await automationAnywhereService.getScheduleSummary();
    res.json(summary);
  } catch (err) {
    console.error("[GET /schedule/summary]", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
}
