import * as Phaser from "phaser";

// import { debugDraw } from '../utils/debug'
import { createCharacterAnims } from "../anims/CharacterAnims";
import { Event, phaserEvents } from "../events/EventCenter";

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

export default class Game extends Phaser.Scene {
  network!: Network;
  private cursors!: NavKeys;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private map!: Phaser.Tilemaps.Tilemap;
  myPlayer!: MyPlayer;
  private playerSelector!: Phaser.GameObjects.Zone;
  private otherPlayers!: Phaser.Physics.Arcade.Group;
  private otherPlayerMap = new Map<string, OtherPlayer>();
  // Whiteboard removed
  private computerMap = new Map<string, Computer>();

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

    // Use selected avatar from network (default to 'adam')
    const avatarName =
      (typeof this.network.getMyAvatarName === "function"
        ? this.network.getMyAvatarName()
        : "adam") || "adam";
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
    ).myPlayer(705, 500, avatarName, this.network.mySessionId);
    const initialName =
      (typeof this.network.getUsername === "function"
        ? this.network.getUsername()
        : undefined) || "";
    if (initialName) this.myPlayer.setPlayerName(initialName);
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16);

    // import chair objects from Tiled map to Phaser
    const chairs = this.physics.add.staticGroup({ classType: Chair });
    const chairLayer = this.map.getObjectLayer("Chair")!;
    chairLayer.objects.forEach(
      (chairObj: Phaser.Types.Tilemaps.TiledObject) => {
        const item = this.addObjectFromTiled(
          chairs,
          chairObj,
          "chairs",
          "chair",
        ) as Chair;
        // custom properties[0] is the object direction specified in Tiled
        const props = (
          chairObj as unknown as {
            properties?: Array<{ name: string; value: unknown }>;
          }
        ).properties;
        if (props && props.length > 0) {
          (item as Chair).itemDirection = props[0].value as string;
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

    if (groundLayer)
      this.physics.add.collider(
        [this.myPlayer, this.myPlayer.playerContainer],
        groundLayer,
      );
    // collide players with vending machines and other collidable groups
    if (typeof vendingMachines !== "undefined") {
      this.physics.add.collider(
        [this.myPlayer, this.myPlayer.playerContainer],
        vendingMachines,
      );
    }

    // item selection overlaps
    this.physics.add.overlap(
      this.playerSelector,
      [chairs, computers, vendingMachines],
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
    phaserEvents.on(
      Event.MY_PLAYER_SET_POSITION,
      this.handleMyPlayerSetPosition,
      this,
    );
    // Chat removed: no onChatMessageAdded subscription
  }

  private handleMyPlayerSetPosition(x: number, y: number) {
    if (this.myPlayer) {
      this.myPlayer.x = x;
      this.myPlayer.y = y;
      this.myPlayer.playerContainer.x = x;
      this.myPlayer.playerContainer.y = y - 30;
      console.log("📍 Teleported myPlayer to:", x, y);
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
      this.physics.add.collider(
        [this.myPlayer, this.myPlayer.playerContainer],
        group,
      );
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    console.log("🎮 Game.handlePlayerJoined called:", { id, newPlayer });
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
      "✅ OtherPlayer added to map, total:",
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
    const otherPlayer = this.otherPlayerMap.get(id);
    otherPlayer?.updateOtherPlayer(field, value);
  }

  private handlePlayersOverlap(): void {
    // WebRTC removed
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
}
