// Export tRPC utilities for creating routers
export {
  router,
  publicProcedure,
  protectedProcedure,
  createContext,
} from "./trpc.js";
export type { Context } from "./trpc.js";

// Export routers
import { router } from "./trpc.js";
import { userRouter } from "./routes/user.js";
import { spaceRouter } from "./routes/space.js";
import { avatarRouter } from "./routes/avatar.js";
import { elementRouter } from "./routes/element.js";
import { adminRouter } from "./routes/admin.js";
import { mediasoupRouter } from "./routes/mediasoup.js";

export const appRouter = router({
  user: userRouter,
  space: spaceRouter,
  avatar: avatarRouter,
  element: elementRouter,
  admin: adminRouter,
  mediasoup: mediasoupRouter,
});

export type AppRouter = typeof appRouter;

// Export standalone routers if needed
export {
  userRouter,
  spaceRouter,
  avatarRouter,
  elementRouter,
  adminRouter,
  mediasoupRouter,
};

// Export type utilities
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
