import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { prismaClient } from "@repo/store";
import {
  createAdminElementSchema,
  updateAdminElementSchema,
  createAvatarSchema,
  createMapSchema,
} from "@repo/validators";
import { z } from "zod";

export const adminRouter = router({
  createElement: protectedProcedure
    .input(createAdminElementSchema)
    .mutation(async ({ ctx, input }) => {
      // Check admin role
      const user = await prismaClient.user.findUnique({
        where: { id: ctx.user.userId },
      });

      if (!user || user.role !== "Admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const element = await prismaClient.element.create({
        data: {
          width: input.width,
          height: input.height,
          imageUrl: input.imageUrl,
          static: input.static,
        },
      });

      return { id: element.id };
    }),

  updateElement: protectedProcedure
    .input(z.object({ id: z.string(), imageUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const user = await prismaClient.user.findUnique({
        where: { id: ctx.user.userId },
      });

      if (!user || user.role !== "Admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const element = await prismaClient.element.update({
        where: { id: input.id },
        data: {
          imageUrl: input.imageUrl,
        },
      });

      return { id: element.id };
    }),

  createAvatar: protectedProcedure
    .input(createAvatarSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await prismaClient.user.findUnique({
        where: { id: ctx.user.userId },
      });

      if (!user || user.role !== "Admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const avatar = await prismaClient.avatar.create({
        data: {
          name: input.name,
          imageUrl: input.imageUrl,
        },
      });

      return { avatarId: avatar.id };
    }),

  createMap: protectedProcedure
    .input(createMapSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await prismaClient.user.findUnique({
        where: { id: ctx.user.userId },
      });

      if (!user || user.role !== "Admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const [widthStr, heightStr] = input.dimensions.split("x");
      const width = parseInt(widthStr || "0", 10);
      const height = parseInt(heightStr || "0", 10);

      const map = await prismaClient.map.create({
        data: {
          name: input.name,
          thumbnail: input.thumbnail,
          width,
          height,
          elements: {
            create: input.defaultElements.map((e) => ({
              elementId: e.elementId,
              x: e.x,
              y: e.y,
            })),
          },
        },
      });

      return { id: map.id };
    }),
});
