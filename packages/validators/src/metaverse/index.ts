import { z } from "zod";

export const updateMetadataSchema = z.object({
  avatarId: z.string(),
});

export const createSpaceSchema = z.object({
  name: z.string().min(1),
  dimensions: z.string().regex(/^[0-9]+x[0-9]+$/), // "100x200"
  mapId: z.string().optional(),
});

export const addElementSchema = z.object({
  elementId: z.string(),
  spaceId: z.string(),
  x: z.number(),
  y: z.number(),
});

export const deleteElementSchema = z.object({
  id: z.string(),
});

export const createAdminElementSchema = z.object({
  imageUrl: z.string().url(),
  width: z.number(),
  height: z.number(),
  static: z.boolean(),
});

export const updateAdminElementSchema = z.object({
  imageUrl: z.string().url(),
});

export const createAvatarSchema = z.object({
  name: z.string(),
  imageUrl: z.string().url(),
});

export const createMapSchema = z.object({
  thumbnail: z.string().url(),
  dimensions: z.string().regex(/^[0-9]+x[0-9]+$/),
  name: z.string(),
  defaultElements: z.array(
    z.object({
      elementId: z.string(),
      x: z.number(),
      y: z.number(),
    }),
  ),
});
