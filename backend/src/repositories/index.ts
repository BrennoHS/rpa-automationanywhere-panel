import { env } from "../config/env";
import { IRobotRepository } from "./IRobotRepository";
import { JsonRobotRepository } from "./JsonRobotRepository";
import { SqliteRobotRepository } from "./SqliteRobotRepository";
import { SqlServerRobotRepository } from "./SqlServerRobotRepository";

/**
 * Fabrica de repositorio. Troca a fonte de dados via DATA_SOURCE no .env
 * sem tocar em controllers nem services.
 */
export function makeRobotRepository(): IRobotRepository {
  switch (env.dataSource) {
    case "sqlite":
      return new SqliteRobotRepository();
    case "sqlserver":
      return new SqlServerRobotRepository();
    case "json":
    default:
      return new JsonRobotRepository();
  }
}
