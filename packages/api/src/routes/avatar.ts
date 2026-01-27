import { router, publicProcedure } from "../trpc.js";
import { prismaClient } from "@repo/store";

export const avatarRouter = router({
  getAll: publicProcedure.query(async () => {
    const avatars = await prismaClient.avatar.findMany();
    return {
      avatars: avatars.map((a) => ({
        id: a.id,
        imageUrl: a.imageUrl,
        name: a.name,
      })),
    };
  }),
});
