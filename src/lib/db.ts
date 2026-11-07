import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

try {
	process.loadEnvFile(".env");
} catch {}

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
	g.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
