// Export tRPC utilities for creating routers
export {
  router,
  publicProcedure,
  protectedProcedure,
  createContext,
} from "./trpc.js";
export type { Context } from "./trpc.js";

// Export routers
export { userRouter } from "./routes/user.js";

// Export type utilities
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
