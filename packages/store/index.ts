import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/index.js";
import { DATABASE_URL } from "@repo/config";

const adapter = new PrismaNeon({ connectionString: DATABASE_URL });

export const prismaClient = new PrismaClient({ adapter });
