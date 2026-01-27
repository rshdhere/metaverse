import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { prismaClient } from "@repo/store";
import {
  createSpaceSchema,
  addElementSchema,
  deleteElementSchema,
} from "@repo/validators";

export const spaceRouter = router({
  create: protectedProcedure
    .input(createSpaceSchema)
    .mutation(async ({ ctx, input }) => {
      // Parse dimensions string "100x200" -> width, height
      const [widthStr, heightStr] = input.dimensions.split("x");
      const width = parseInt(widthStr || "0", 10);
      const height = parseInt(heightStr || "0", 10);

      if (!input.mapId) {
        // Create empty space
        const space = await prismaClient.space.create({
          data: {
            name: input.name,
            width,
            height,
            creatorId: ctx.user.userId,
          },
        });
        return { spaceId: space.id };
      }

      // Create from map
      const map = await prismaClient.map.findUnique({
        where: { id: input.mapId },
        include: { elements: true },
      });

      if (!map) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Map not found",
        });
      }

      const space = await prismaClient.space.create({
        data: {
          name: input.name,
          width: map.width,
          height: map.height,
          thumbnail: map.thumbnail, // Assuming map has thumbnail? Schema says Space.thumbnail
          creatorId: ctx.user.userId,
        },
      });

      // Copy elements from map to space
      if (map.elements.length > 0) {
        await prismaClient.spaceElements.createMany({
          data: map.elements.map((e) => ({
            spaceId: space.id,
            elementId: e.elementId!, // Assuming elements in map exist
            x: e.x!,
            y: e.y!,
          })),
        });
      }

      return { spaceId: space.id };
    }),

  delete: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const space = await prismaClient.space.findUnique({
        where: { id: input.spaceId },
      });

      if (!space) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Space not found",
        });
      }

      if (space.creatorId !== ctx.user.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own spaces",
        });
      }

      await prismaClient.space.delete({
        where: { id: input.spaceId },
      });

      return { success: true };
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const spaces = await prismaClient.space.findMany({
      where: {
        creatorId: ctx.user.userId,
      },
    });

    return {
      spaces: spaces.map((s) => ({
        id: s.id,
        name: s.name,
        dimensions: `${s.width}x${s.height}`,
        thumbnail: s.thumbnail,
      })),
    };
  }),

  getById: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const space = await prismaClient.space.findUnique({
        where: { id: input.spaceId },
        include: {
          elements: {
            include: {
              element: true,
            },
          },
        },
      });

      if (!space) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Space not found",
        });
      }

      return {
        dimensions: `${space.width}x${space.height}`,
        elements: space.elements.map((e) => ({
          id: e.id,
          element: {
            id: e.element.id,
            imageUrl: e.element.imageUrl,
            static: e.element.static,
            height: e.element.height,
            width: e.element.width,
          },
          x: e.x,
          y: e.y,
        })),
      };
    }),

  addElement: protectedProcedure
    .input(addElementSchema)
    .mutation(async ({ ctx, input }) => {
      const space = await prismaClient.space.findUnique({
        where: { id: input.spaceId },
      });

      if (!space) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Space not found",
        });
      }

      if (space.creatorId !== ctx.user.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit your own spaces",
        });
      }

      // Check boundary
      if (
        input.x < 0 ||
        input.y < 0 ||
        input.x > space.width ||
        (space.height && input.y > space.height)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Element out of bounds",
        });
      }

      await prismaClient.spaceElements.create({
        data: {
          spaceId: input.spaceId,
          elementId: input.elementId,
          x: input.x,
          y: input.y,
        },
      });

      return { success: true };
    }),

  deleteElement: protectedProcedure
    .input(deleteElementSchema)
    .mutation(async ({ ctx, input }) => {
      const element = await prismaClient.spaceElements.findUnique({
        where: { id: input.id },
        include: { space: true },
      });

      if (!element) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Element not found",
        });
      }

      if (element.space.creatorId !== ctx.user.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit your own spaces",
        });
      }

      await prismaClient.spaceElements.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
