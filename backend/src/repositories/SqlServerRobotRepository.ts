import { Robot } from "../types";
import { IRobotRepository } from "./IRobotRepository";

/**
 * Stub para o banco corporativo (SQL Server).
 *
 * Para ativar:
 *   1. npm i mssql
 *   2. configure SQLSERVER_* no .env
 *   3. implemente os metodos usando a connection pool do mssql
 *   4. defina DATA_SOURCE=sqlserver no .env
 */
export class SqlServerRobotRepository implements IRobotRepository {
  async findAll(): Promise<Robot[]> {
    throw new Error("SqlServerRobotRepository ainda nao implementado. Veja os comentarios do arquivo.");
  }
  async findById(_id: string): Promise<Robot | undefined> {
    throw new Error("SqlServerRobotRepository ainda nao implementado. Veja os comentarios do arquivo.");
  }
}
