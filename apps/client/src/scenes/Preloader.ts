import * as Phaser from "phaser";
import Network from "../services/Network";

export default class Preloader extends Phaser.Scene {
  private preloadComplete = false;
  network!: Network;
  private pendingAvatarName?: string;
  private gameSceneReadyResolve?: () => void;

  constructor() {
    super("preloader");
  }

  preload() {
    // Load background texture for the game
    this.load.image(
      "wood_tile_bg",
      "/assets/background/22_wood and ceramic tile texture-seamless.jpg",
    );

    this.load.tilemapTiledJSON("tilemap", "/assets/map/map.json");
    this.load.spritesheet("tiles_wall", "/assets/map/FloorAndGround.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("chairs", "/assets/items/chair.png", {
      frameWidth: 32,
      frameHeight: 64,
    });
    this.load.spritesheet("computers", "/assets/items/computer.png", {
      frameWidth: 96,
      frameHeight: 64,
    });
    // Whiteboard sprites removed
    this.load.spritesheet(
      "vendingmachines",
      "/assets/items/vendingmachine.png",
      {
        frameWidth: 48,
        frameHeight: 72,
      },
    );
    this.load.spritesheet(
      "office",
      "/assets/tileset/Modern_Office_Black_Shadow.png",
      {
        frameWidth: 32,
        frameHeight: 32,
      },
    );
    this.load.spritesheet("basement", "/assets/tileset/Basement.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("generic", "/assets/tileset/Generic.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("adam", "/assets/character/adam.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("ash", "/assets/character/ash.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("lucy", "/assets/character/lucy.png", {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet("nancy", "/assets/character/nancy.png", {
      frameWidth: 32,
      frameHeight: 48,
    });

    this.load.on("complete", () => {
      this.preloadComplete = true;
      // Assets loaded, waiting for launchGame() to be called from React
    });
  }

  init() {
    this.network = new Network();
  }

  setPendingAvatarName(name: string) {
    const chosen = (name || "adam").toLowerCase();
    this.pendingAvatarName = chosen;
    if (this.network && typeof this.network.setMyAvatarName === "function") {
      this.network.setMyAvatarName(chosen);
    }
  }

  isReady(): boolean {
    return this.preloadComplete;
  }

  // Called by Game scene when it's fully ready
  notifyGameSceneReady() {
    if (this.gameSceneReadyResolve) {
      this.gameSceneReadyResolve();
      this.gameSceneReadyResolve = undefined;
    }
  }

  async launchGame(): Promise<boolean> {
    if (!this.preloadComplete) {
      console.warn("Cannot launch game - preload not complete");
      return false;
    }

    // Check if game scene is already running
    if (this.scene.isActive("game")) {
      console.log("Game scene already running");
      return true;
    }

    // Ensure avatar is applied to shared network before creating the game scene
    if (
      this.pendingAvatarName &&
      typeof this.network.setMyAvatarName === "function"
    ) {
      this.network.setMyAvatarName(this.pendingAvatarName);
    }

    // Create a promise that resolves when the Game scene is fully ready
    const gameReadyPromise = new Promise<void>((resolve) => {
      this.gameSceneReadyResolve = resolve;
    });

    // Launch the game scene with the office map
    this.scene.launch("game", {
      network: this.network,
    });

    // Wait for Game scene to signal it's ready (with timeout)
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, 2000); // 2 second timeout
    });

    await Promise.race([gameReadyPromise, timeoutPromise]);

    console.log("Game scene launched and ready");
    return true;
  }
}
