import { JsonExecutionRepository } from "./json-execution.repository.js";
import { PrismaExecutionRepository } from "./prisma-execution.repository.js";
import type { IExecutionRepository } from "./types.js";

const persistenceMode = process.env.PERSISTENCE || "json";

export const storeRepository: IExecutionRepository = persistenceMode === "sqlite"
  ? new PrismaExecutionRepository()
  : new JsonExecutionRepository();

console.log(`[repository] Active persistence mode: ${persistenceMode.toUpperCase()}`);
