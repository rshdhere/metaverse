import {
  router,
  userRouter,
  spaceRouter,
  avatarRouter,
  elementRouter,
  adminRouter,
} from "@repo/api";

const appRouter = router({
  user: userRouter,
  space: spaceRouter,
  avatar: avatarRouter,
  element: elementRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

export { appRouter };
