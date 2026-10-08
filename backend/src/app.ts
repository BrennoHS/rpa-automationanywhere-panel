import express from "express";
import cors from "cors";
import routes from "./routes";
import { logCall } from "./services/callLog";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  // requisicoes do navegador pro backend (nao inclui /api/debug pra nao poluir o proprio log)
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/api/debug")) return next();
    const startedAt = Date.now();
    res.on("finish", () => {
      const len = Number(res.getHeader("content-length"));
      logCall({ target: "API", method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - startedAt, bytes: Number.isFinite(len) && len > 0 ? len : null });
    });
    next();
  });
  app.use("/api", routes);
  return app;
}
