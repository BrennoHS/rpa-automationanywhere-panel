import fs from "fs";
import path from "path";
import { Robot } from "../types";
import { env } from "../config/env";
import { IRobotRepository } from "./IRobotRepository";

/** Implementacao padrao do MVP: le os robos de um arquivo JSON local. */
export class JsonRobotRepository implements IRobotRepository {
  private readonly file = path.join(env.dataDir, "robots.json");

  private read(): Robot[] {
    const raw = fs.readFileSync(this.file, "utf-8");
    return JSON.parse(raw) as Robot[];
  }

  async findAll(): Promise<Robot[]> {
    return this.read();
  }

  async findById(id: string): Promise<Robot | undefined> {
    return this.read().find((r) => r.id === id);
  }
}
