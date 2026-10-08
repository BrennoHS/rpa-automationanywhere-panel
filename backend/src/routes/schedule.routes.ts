import { Router } from "express";
import { getSchedule, getScheduleSummary } from "../controllers/scheduleController";

const router = Router();

router.get("/summary", getScheduleSummary);
router.get("/", getSchedule);

export default router;
