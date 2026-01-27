import { router, publicProcedure } from "../trpc.js";
import { prismaClient } from "@repo/store";

export const elementRouter = router({
  getAll: publicProcedure.query(async () => {
    const elements = await prismaClient.element.findMany();
    return {
      elements: elements.map((e) => ({
        id: e.id,
        imageUrl: e.imageUrl,
        width: e.width,
        height: e.height,
        static: e.static,
      })),
    };
  }),
});
