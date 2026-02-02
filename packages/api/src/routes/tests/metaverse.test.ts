import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prismaClient } from "@repo/store";
import { appRouter } from "../../index.js";

// Mock context creator
const createCaller = (userId: string, role: "Admin" | "User" = "User") => {
  return appRouter.createCaller({
    user: { userId },
  });
};

describe("Metaverse Routes", () => {
  let adminId: string;
  let userId: string;
  let adminToken: string;
  let userToken: string;
  let adminCaller: any;
  let userCaller: any;

  beforeAll(async () => {
    // localized setup
    const adminEmail = `admin-${Date.now()}@test.com`;
    const userEmail = `user-${Date.now()}@test.com`;

    const admin = await prismaClient.user.create({
      data: {
        email: adminEmail,
        role: "Admin",
      },
    });
    adminId = admin.id;

    const user = await prismaClient.user.create({
      data: {
        email: userEmail,
        role: "User",
      },
    });
    userId = user.id;

    adminCaller = appRouter.createCaller({ user: { userId: adminId } });
    userCaller = appRouter.createCaller({ user: { userId: userId } });
  });

  afterAll(async () => {
    // Cleanup
    const spaces = await prismaClient.space.findMany({
      where: { creatorId: userId },
    });
    await prismaClient.spaceElements.deleteMany({
      where: { spaceId: { in: spaces.map((s) => s.id) } },
    });
    await prismaClient.space.deleteMany({
      where: { creatorId: userId },
    });
    await prismaClient.user.deleteMany({
      where: { id: { in: [adminId, userId] } },
    });
  });

  it("should allow admin to create an element", async () => {
    const result = await adminCaller.admin.createElement({
      width: 1,
      height: 1,
      imageUrl: "http://example.com/chair.png",
      static: true,
    });
    expect(result.id).toBeDefined();

    // Verify element exists
    const elements = await userCaller.element.getAll();
    expect(elements.elements.some((e: any) => e.id === result.id)).toBe(true);
  }, 60000);

  it("should allow admin to create an avatar", async () => {
    const result = await adminCaller.admin.createAvatar({
      name: "Cool Avatar",
      imageUrl: "http://example.com/avatar.png",
    });
    expect(result.avatarId).toBeDefined();

    // Verify avatar exists
    const avatars = await userCaller.avatar.getAll();
    expect(avatars.avatars.some((a: any) => a.id === result.avatarId)).toBe(
      true,
    );
  }, 60000);

  it("should allow user to create a space", async () => {
    const result = await userCaller.space.create({
      name: "My Space",
      dimensions: "100x100",
    });
    expect(result.spaceId).toBeDefined();

    // Verify space retrieval
    const space = await userCaller.space.getById({ spaceId: result.spaceId });
    expect(space.dimensions).toBe("100x100");

    // Add element to space
    const element = await adminCaller.admin.createElement({
      width: 1,
      height: 1,
      imageUrl: "http://example.com/tree.png",
      static: true,
    });

    await userCaller.space.addElement({
      spaceId: result.spaceId,
      elementId: element.id,
      x: 10,
      y: 10,
    });

    const spaceWithElement = await userCaller.space.getById({
      spaceId: result.spaceId,
    });
    expect(spaceWithElement.elements.length).toBe(1);

    // Get element ID from space elements to delete
    const spaceElementId = spaceWithElement.elements[0].id;
    await userCaller.space.deleteElement({ id: spaceElementId });

    const spaceAfterDelete = await userCaller.space.getById({
      spaceId: result.spaceId,
    });
    expect(spaceAfterDelete.elements.length).toBe(0);

    // Delete space
    await userCaller.space.delete({ spaceId: result.spaceId });
    // Verify deletion (should throw NOT_FOUND)
    try {
      await userCaller.space.getById({ spaceId: result.spaceId });
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.code).toBe("NOT_FOUND");
    }
  }, 60000);

  it("should allow admin to create a map", async () => {
    const element = await adminCaller.admin.createElement({
      width: 1,
      height: 1,
      imageUrl: "http://example.com/rock.png",
      static: true,
    });

    const result = await adminCaller.admin.createMap({
      name: "Test Map",
      dimensions: "200x200",
      thumbnail: "http://example.com/map.png",
      defaultElements: [{ elementId: element.id, x: 50, y: 50 }],
    });
    expect(result.id).toBeDefined();

    // Create space from map
    const space = await userCaller.space.create({
      name: "Map Space",
      dimensions: "0x0", // Ignored when mapId is present? Wait, schema validation requires regex
      // Logic in space.create: if mapId, dims from map. BUT validation runs first.
      // We need to pass valid dims string even if ignored, or update validator.
      // Let's pass valid dummy dims.
      mapId: result.id,
    });
    expect(space.spaceId).toBeDefined();

    const createdSpace = await userCaller.space.getById({
      spaceId: space.spaceId,
    });
    expect(createdSpace.dimensions).toBe("200x200");
    expect(createdSpace.elements.length).toBe(1);
  }, 60000);

  it("should allow admin to update element", async () => {
    const element = await adminCaller.admin.createElement({
      width: 1,
      height: 1,
      imageUrl: "http://example.com/old.png",
      static: true,
    });

    await adminCaller.admin.updateElement({
      id: element.id,
      imageUrl: "http://example.com/new.png",
    });

    const elements = await userCaller.element.getAll();
    const updated = elements.elements.find((e: any) => e.id === element.id);
    expect(updated.imageUrl).toBe("http://example.com/new.png");
  }, 60000);

  it("should allow user to update metadata", async () => {
    // First create an avatar
    const avatar = await prismaClient.avatar.create({
      data: { name: "Test", imageUrl: "http://test.com" },
    });

    await userCaller.user.updateMetadata({ avatarId: avatar.id });

    // Verify
    const user = await prismaClient.user.findUnique({ where: { id: userId } });
    expect(user?.avatarId).toBe(avatar.id);

    // Verify bulk metadata
    const bulk = await userCaller.user.getBulkMetadata({ ids: [userId] });
    expect(bulk.avatars.length).toBe(1);
    expect(bulk.avatars[0].imageUrl).toBe("http://test.com");
  });
});
