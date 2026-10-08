import { Robot } from "../types";
import { IRobotRepository } from "./IRobotRepository";

/**
 * Stub pronto para o proximo passo.
 *
 * Para ativar:
 *   1. npm i better-sqlite3 && npm i -D @types/better-sqlite3
 *   2. crie a tabela robots e implemente os metodos abaixo
 *   3. defina DATA_SOURCE=sqlite no .env
 */
export class SqliteRobotRepository implements IRobotRepository {
  async findAll(): Promise<Robot[]> {
    throw new Error("SqliteRobotRepository ainda nao implementado. Veja os comentarios do arquivo.");
  }
  async findById(_id: string): Promise<Robot | undefined> {
    throw new Error("SqliteRobotRepository ainda nao implementado. Veja os comentarios do arquivo.");
  }
}
