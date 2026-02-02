import * as Phaser from "phaser";

// import { debugDraw } from '../utils/debug'
import { createCharacterAnims } from "../anims/CharacterAnims";

import Item from "../items/Item";
import Chair from "../items/Chair";
import Computer from "../items/Computer";
import VendingMachine from "../items/VendingMachine";
import "../characters/MyPlayer";
import "../characters/OtherPlayer";
import MyPlayer from "../characters/MyPlayer";
import OtherPlayer from "../characters/OtherPlayer";
import PlayerSelector from "../characters/PlayerSelector";
import Network from "../services/Network";
import { phaserEvents, Event } from "../events/EventCenter";
import { toast } from "sonner";
import Pathfinder from "../utils/Pathfinder";

type NavKeys = Phaser.Types.Input.Keyboard.CursorKeys & {
  W?: Phaser.Input.Keyboard.Key;
  A?: Phaser.Input.Keyboard.Key;
  S?: Phaser.Input.Keyboard.Key;
  D?: Phaser.Input.Keyboard.Key;
};
type Keyboard = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};
type IPlayer = { x: number; y: number; anim: string; name?: string };
type MeetingPromptRole = "sender" | "receiver";
type MeetingPromptMessage = {
  peerId: string;
  role: MeetingPromptRole;
};

export default class Game extends Phaser.Scene {
  network!: Network;
  private cursors!: NavKeys;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private map!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  myPlayer!: MyPlayer;
  private playerSelector!: Phaser.GameObjects.Zone;
  private otherPlayers!: Phaser.Physics.Arcade.Group;
  private otherPlayerMap = new Map<string, OtherPlayer>();
  private proximityState = new Map<
    string,
    { enteredAt: number; lastPromptAt: number }
  >();
  private meetingPromptQueue: MeetingPromptMessage[] = [];
  private meetingPromptActive = false;
  private meetingPromptTimer?: number;
  private isTeleportingToMeeting = false; // Flag to bypass server corrections during meeting teleport
  // Whiteboard removed
  private computerMap = new Map<string, Computer>();
  private chairs!: Phaser.Physics.Arcade.StaticGroup;
  private static readonly PROXIMITY_RADIUS = 120;
  private static readonly PROXIMITY_DWELL_MS = 3000;
  private static readonly PROXIMITY_COOLDOWN_MS = 10000;
  private static readonly PROXIMITY_PROMPT_DURATION_MS = 5000;

  constructor() {
    super("game");
  }

  registerKeys() {
    this.cursors = {
      ...this.input.keyboard!.createCursorKeys(),
      ...(this.input.keyboard!.addKeys("W,S,A,D") as Keyboard),
    };

    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyE = this.input.keyboard!.addKey("E");
    this.keyR = this.input.keyboard!.addKey("R");
    this.input.keyboard!.disableGlobalCapture();
    // Chat removed: no ENTER/ESC chat toggles
  }

  disableKeys() {
    this.input.keyboard!.enabled = false;
  }

  enableKeys() {
    this.input.keyboard!.enabled = true;
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error("server instance missing");
    } else {
      this.network = data.network;
    }

    // Register keyboard controls
    this.registerKeys();

    createCharacterAnims(this.anims);

    // Add a repeating grass background under the map that moves with the camera
    const vw = this.cameras.main.width;
    const vh = this.cameras.main.height;
    const underlay = this.add
      .tileSprite(0, 0, vw, vh, "wood_tile_bg")
      .setOrigin(0, 0);
    underlay.setScrollFactor(0);

    this.map = this.make.tilemap({ key: "tilemap" });
    const FloorAndGround = this.map.addTilesetImage(
      "FloorAndGround",
      "tiles_wall",
    )!;

    const groundLayer = this.map.createLayer("Ground", FloorAndGround)!;
    groundLayer!.setCollisionByProperty({ collides: true });

    // debugDraw(groundLayer, this)

    // Initialize Pathfinder
    this.pathfinder = new Pathfinder(this.map, "Ground");

    // Use selected avatar from network (default to 'adam')
    const avatarName =
      (typeof this.network.getMyAvatarName === "function"
        ? this.network.getMyAvatarName()
        : "adam") || "adam";

    // Try to restore last position, or use default spawn point
    const DEFAULT_SPAWN_X = 705;
    const DEFAULT_SPAWN_Y = 500;
    const lastPosition = this.network.getLastPosition("public-lobby");
    const spawnX = lastPosition?.x ?? DEFAULT_SPAWN_X;
    const spawnY = lastPosition?.y ?? DEFAULT_SPAWN_Y;

    // Set the space ID for position persistence
    this.network.setCurrentSpaceId("public-lobby");

    this.myPlayer = (
      this.add as unknown as {
        myPlayer: (
          x: number,
          y: number,
          tex: string,
          id: string,
          frame?: string | number,
        ) => MyPlayer;
      }
    ).myPlayer(spawnX, spawnY, avatarName, this.network.mySessionId);

    // Initialize position tracking with spawn position
    this.network.updatePosition(spawnX, spawnY);

    const initialName =
      (typeof this.network.getUsername === "function"
        ? this.network.getUsername()
        : undefined) || "";
    if (initialName) this.myPlayer.setPlayerName(initialName);
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16);

    // import chair objects from Tiled map to Phaser
    this.chairs = this.physics.add.staticGroup({ classType: Chair });
    const chairLayer = this.map.getObjectLayer("Chair")!;
    chairLayer.objects.forEach(
      (chairObj: Phaser.Types.Tilemaps.TiledObject) => {
        const item = this.addObjectFromTiled(
          this.chairs,
          chairObj,
          "chairs",
          "chair",
        ) as Chair;

        // Parse custom properties from Tiled (direction and meeting)
        const props = (
          chairObj as unknown as {
            properties?: Array<{ name: string; value: unknown }>;
          }
        ).properties;
        if (props) {
          for (const prop of props) {
            if (prop.name === "direction") {
              (item as Chair).itemDirection = prop.value as string;
            } else if (prop.name === "meeting") {
              (item as Chair).isMeetingChair = prop.value as boolean;
            }
          }
        }
      },
    );

    // import computers objects from Tiled map to Phaser
    const computers = this.physics.add.staticGroup({ classType: Computer });
    const computerLayer = this.map.getObjectLayer("Computer")!;
    computerLayer.objects.forEach((obj, i) => {
      const item = this.addObjectFromTiled(
        computers,
        obj,
        "computers",
        "computer",
      ) as Computer;
      item.setDepth(item.y + item.height * 0.27);
      const id = `${i}`;
      item.id = id;
      this.computerMap.set(id, item);
    });

    // import whiteboards objects from Tiled map to Phaser
    // Whiteboards removed

    // import vending machine objects from Tiled map to Phaser
    const vendingMachines = this.physics.add.staticGroup({
      classType: VendingMachine,
    });
    const vendingMachineLayer = this.map.getObjectLayer("VendingMachine")!;
    vendingMachineLayer.objects.forEach((obj) => {
      this.addObjectFromTiled(
        vendingMachines,
        obj,
        "vendingmachines",
        "vendingmachine",
      );
    });

    // import other objects from Tiled map to Phaser
    this.addGroupFromTiled("Wall", "tiles_wall", "FloorAndGround", false);
    this.addGroupFromTiled(
      "Objects",
      "office",
      "Modern_Office_Black_Shadow",
      false,
    );
    this.addGroupFromTiled(
      "ObjectsOnCollide",
      "office",
      "Modern_Office_Black_Shadow",
      true,
    );
    this.addGroupFromTiled("GenericObjects", "generic", "Generic", false);
    this.addGroupFromTiled(
      "GenericObjectsOnCollide",
      "generic",
      "Generic",
      true,
    );
    this.addGroupFromTiled("Basement", "basement", "Basement", true);

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer });

    // Tighten camera framing around the player and zoom in a bit
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.myPlayer, true, 0.08, 0.08);
    // Set camera bounds to the map size so it only shows the arena
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

    // Parallax the grass underlay with camera scroll to look infinite
    this.events.on("update", () => {
      underlay.tilePositionX = this.cameras.main.scrollX * 0.5;
      underlay.tilePositionY = this.cameras.main.scrollY * 0.5;
    });

    if (groundLayer) this.physics.add.collider(this.myPlayer, groundLayer);
    // collide players with vending machines and other collidable groups
    if (typeof vendingMachines !== "undefined") {
      this.physics.add.collider(this.myPlayer, vendingMachines);
    }

    // item selection overlaps
    this.physics.add.overlap(
      this.playerSelector,
      [this.chairs, computers, vendingMachines],
      this
        .handleItemSelectorOverlap as unknown as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.myPlayer,
      this.otherPlayers,
      this
        .handlePlayersOverlap as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this);
    this.network.onPlayerLeft(this.handlePlayerLeft, this);
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this);
    // WebRTC removed
    // listen for position/anim updates
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this);
    // Listen for meeting acceptance
    this.network.onMeetingAccepted((fromUserId: string) => {
      console.log("Navigating to meeting as accepted by", fromUserId);
      toast.dismiss(); // Dismiss any active toasts
      this.handleNavigateToSittingArea();
    }, this);
    // Chat removed: no onChatMessageAdded subscription

    // Listen for meeting navigation events
    phaserEvents.on(
      Event.NAVIGATE_TO_SITTING_AREA,
      this.handleNavigateToSittingArea,
      this,
    );

    phaserEvents.on(
      Event.MEETING_ENDED,
      this.handleNavigateFromSittingArea,
      this,
    );

    // Signal that Game scene is ready - this flushes the event queue
    this.network.setGameSceneReady();

    // Also notify Preloader so the async launchGame() can resolve
    const preloaderScene = this.scene.get("preloader") as unknown as {
      notifyGameSceneReady?: () => void;
    };
    if (preloaderScene?.notifyGameSceneReady) {
      preloaderScene.notifyGameSceneReady();
    }
  }

  private handleItemSelectorOverlap(
    playerSelector: Phaser.GameObjects.Zone,
    selectionItem: Item,
  ) {
    // currentItem may be undefined if nothing was previously selected
    const currentItem = (playerSelector as unknown as { selectedItem?: Item })
      .selectedItem;
    if (currentItem) {
      // if the selection has not changed or the current item is above the new item, do nothing
      if (
        currentItem === (selectionItem as unknown) ||
        currentItem.depth >= selectionItem.depth
      ) {
        return;
      }
      // if selection changes, clear previous dialog
      (currentItem as Item).clearDialogBox();
    }

    // set selected item and set up new dialog
    (playerSelector as unknown as { selectedItem?: Item }).selectedItem =
      selectionItem;
    (selectionItem as Item).onOverlapDialog();
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string,
  ) {
    const actualX = object.x! + object.width! * 0.5;
    const actualY = object.y! - object.height! * 0.5;
    const tileset = this.map.getTileset(tilesetName)!;
    const obj = group
      .get(actualX, actualY, key, object.gid! - tileset.firstgid)
      .setDepth(actualY);
    return obj;
  }

  private addGroupFromTiled(
    objectLayerName: string,
    key: string,
    tilesetName: string,
    collidable: boolean,
  ) {
    const group = this.physics.add.staticGroup();
    const objectLayer = this.map.getObjectLayer(objectLayerName)!;
    objectLayer.objects.forEach((object) => {
      const actualX = object.x! + object.width! * 0.5;
      const actualY = object.y! - object.height! * 0.5;
      const tileset = this.map.getTileset(tilesetName)!;
      group
        .get(actualX, actualY, key, object.gid! - tileset.firstgid)
        .setDepth(actualY);
    });
    if (this.myPlayer && collidable)
      this.physics.add.collider(this.myPlayer, group);
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    console.log("🎮 Game.handlePlayerJoined called:", { id, newPlayer });

    // Guard: Prevent duplicate player creation
    if (this.otherPlayerMap.has(id)) {
      console.log("⚠️ Player already exists in map, skipping:", id);
      return;
    }

    // Derive texture from the incoming anim prefix (e.g., "lucy_idle_down")
    const animKey = newPlayer.anim || "adam_idle_down";
    const texture = (animKey.split("_")[0] || "adam").toLowerCase();
    const otherPlayer = (
      this.add as unknown as {
        otherPlayer: (
          x: number,
          y: number,
          tex: string,
          id: string,
          name: string,
          frame?: string | number,
        ) => OtherPlayer;
      }
    ).otherPlayer(newPlayer.x, newPlayer.y, texture, id, newPlayer.name || "");
    this.otherPlayers.add(otherPlayer);
    this.otherPlayerMap.set(id, otherPlayer);
    console.log(
      "✅ OtherPlayer created and added to map, total:",
      this.otherPlayerMap.size,
    );
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id);
      if (!otherPlayer) return;
      this.otherPlayers.remove(otherPlayer, true, true);
      this.otherPlayerMap.delete(id);
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true;
  }

  // WebRTC removed

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(
    field: string,
    value: number | string,
    id: string,
  ) {
    // If it's ME, it means the server rejected my movement and sent me back
    if (this.network && id === this.network.mySessionId) {
      // Skip corrections during meeting teleportation
      if (this.isTeleportingToMeeting) {
        console.log(
          "⏭️ Ignoring server correction during meeting teleport:",
          field,
          value,
        );
        return;
      }
      console.log("⚠️ Server corrected my position:", field, value);
      if (field === "x") this.myPlayer.x = value as number;
      if (field === "y") this.myPlayer.y = value as number;
      return;
    }

    const otherPlayer = this.otherPlayerMap.get(id);
    otherPlayer?.updateOtherPlayer(field, value);
  }

  private handlePlayersOverlap(): void {
    // WebRTC removed
  }

  private preMeetingPosition: { x: number; y: number } | null = null;

  // Navigate player to nearest available meeting chair by walking along a path
  private handleNavigateToSittingArea(): void {
    if (!this.myPlayer || !this.chairs || !this.network) return;

    // Store current position before moving
    this.preMeetingPosition = { x: this.myPlayer.x, y: this.myPlayer.y };

    const playerX = this.myPlayer.x;
    const playerY = this.myPlayer.y;

    // Find nearest meeting chair (only chairs marked with meeting: true in the map)
    let nearestChair: Chair | null = null;
    let nearestDistance = Infinity;

    this.chairs.getChildren().forEach((child) => {
      const chair = child as Chair;
      if (!chair.isMeetingChair) return;
      const distance = Phaser.Math.Distance.Between(
        playerX,
        playerY,
        chair.x,
        chair.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestChair = chair;
      }
    });

    if (nearestChair) {
      // Target position in front of the chair
      const targetX = (nearestChair as Chair).x;
      const targetY = (nearestChair as Chair).y + 16;

      // Calculate path
      const start = { x: playerX, y: playerY };
      const target = { x: targetX, y: targetY };

      // Get path from A*
      const path = this.pathfinder.findPath(start, target);

      // If path found, optimize it slightly by replacing last point with exact target
      if (path.length > 0) {
        path[path.length - 1] = target;
      } else {
        // Fallback: direct path if no path found (e.g. start/end invalid)
        path.push(target);
      }

      // Start walking
      const avatarName = this.network.getMyAvatarName() || "adam";
      this.isTeleportingToMeeting = true;
      this.movePlayerAlongPath(path, avatarName);
    }
  }

  private handleNavigateFromSittingArea(): void {
    if (!this.preMeetingPosition || !this.myPlayer || !this.network) return;

    const target = this.preMeetingPosition;
    this.preMeetingPosition = null; // Clear it

    const start = { x: this.myPlayer.x, y: this.myPlayer.y };
    const path = this.pathfinder.findPath(start, target);

    if (path.length > 0) {
      path[path.length - 1] = target;
    } else {
      path.push(target);
    }

    const avatarName = this.network.getMyAvatarName() || "adam";
    this.isTeleportingToMeeting = true;
    this.movePlayerAlongPath(path, avatarName);
  }

  private movePlayerAlongPath(
    path: { x: number; y: number }[],
    avatarName: string,
  ) {
    if (path.length === 0) {
      // Finished walking
      const idleAnim = `${avatarName}_idle_down`;
      this.myPlayer.anims.play(idleAnim, true);
      // Final sync with teleport to ensure exact position
      this.network.teleportPlayer(this.myPlayer.x, this.myPlayer.y, idleAnim);

      this.time.delayedCall(500, () => {
        this.isTeleportingToMeeting = false;
      });
      return;
    }

    const nextPoint = path.shift()!;
    const currentX = this.myPlayer.x;
    const currentY = this.myPlayer.y;

    // Skip if point is too close (already there)
    const dist = Phaser.Math.Distance.Between(
      currentX,
      currentY,
      nextPoint.x,
      nextPoint.y,
    );
    if (dist < 5) {
      this.movePlayerAlongPath(path, avatarName);
      return;
    }

    const dx = nextPoint.x - currentX;
    const dy = nextPoint.y - currentY;
    const speed = 150; // pixels per second
    const duration = (dist / speed) * 1000;

    // Determine animation
    let walkAnim = "";
    if (Math.abs(dx) > Math.abs(dy)) {
      walkAnim = dx > 0 ? `${avatarName}_run_right` : `${avatarName}_run_left`;
    } else {
      walkAnim = dy > 0 ? `${avatarName}_run_down` : `${avatarName}_run_up`;
    }
    this.myPlayer.anims.play(walkAnim, true);

    this.tweens.add({
      targets: this.myPlayer,
      x: nextPoint.x,
      y: nextPoint.y,
      duration: duration,
      ease: "Linear",
      onComplete: () => {
        // Send position update at each step node
        // We use teleportPlayer here to prevent server fighting us if we deviate slightly
        // or if path steps are slightly larger than regular updates
        this.network.teleportPlayer(this.myPlayer.x, this.myPlayer.y, walkAnim);
        this.movePlayerAlongPath(path, avatarName);
      },
    });
  }

  // Chat removed

  update() {
    if (this.myPlayer && this.network) {
      this.playerSelector.update(this.myPlayer, this.cursors);
      this.myPlayer.update(
        this.playerSelector,
        this.cursors,
        this.keyE,
        this.keyR,
        this.network,
      );
    }
  }

  // legacy checkProximityToPlayers removed (server handles this now)

  // legacy processMeetingPromptQueue removed
}
