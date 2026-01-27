import { router, userRouter } from "@repo/api";

const appRouter = router({
  user: userRouter,
});

export type AppRouter = typeof appRouter;

export { appRouter };
