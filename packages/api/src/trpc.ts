import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/config";

export { JWT_SECRET };

export interface Context {
  user: { userId: string } | null;
}

export function createContext(opts: CreateHTTPContextOptions): Context {
  const authHeader = opts.req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null };
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return { user: decoded };
  } catch {
    return { user: null };
  }
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { user: ctx.user } });
});
