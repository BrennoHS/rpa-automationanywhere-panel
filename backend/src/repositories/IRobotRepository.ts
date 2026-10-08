import { Robot } from "../types";

/**
 * Contrato de acesso a dados de robos. Qualquer fonte (JSON, SQLite,
 * SQL Server) implementa esta interface, entao o restante da aplicacao
 * nunca sabe de onde os dados vem.
 */
export interface IRobotRepository {
  findAll(): Promise<Robot[]>;
  findById(id: string): Promise<Robot | undefined>;
}
