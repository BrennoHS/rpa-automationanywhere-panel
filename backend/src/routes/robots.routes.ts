import { Router } from "express";
import { getRobots, getRobotById, getRobotRuns, setRobotMonitored } from "../controllers/robotsController";

const router = Router();

router.get("/", getRobots);
router.get("/:id", getRobotById);
router.get("/:id/runs", getRobotRuns);
router.patch("/:id/monitor", setRobotMonitored);

export default router;
