import {
  router,
  userRouter,
  spaceRouter,
  avatarRouter,
  elementRouter,
  adminRouter,
  mediasoupRouter,
} from "@repo/api";

const appRouter = router({
  user: userRouter,
  space: spaceRouter,
  avatar: avatarRouter,
  element: elementRouter,
  admin: adminRouter,
  mediasoup: mediasoupRouter,
});

export type AppRouter = typeof appRouter;

export { appRouter };
