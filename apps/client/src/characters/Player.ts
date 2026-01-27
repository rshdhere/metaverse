import * as Phaser from "phaser";

export enum PlayerBehavior {
  IDLE = "IDLE",
  SITTING = "SITTING",
}
/**
 * shifting distance for sitting animation
 * format: direction: [xShift, yShift, depthShift]
 */
export const sittingShiftData = {
  up: [0, 3, -10],
  down: [0, 3, 1],
  left: [0, -8, 10],
  right: [0, -8, 10],
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
  playerId: string;
  playerTexture: string;
  playerBehavior = PlayerBehavior.IDLE;
  readyToConnect = false;
  // WebRTC removed
  playerName: Phaser.GameObjects.Text;
  playerContainer: Phaser.GameObjects.Container;
  private playerNameBg?: Phaser.GameObjects.Graphics;
  private playerOnlineDot?: Phaser.GameObjects.Graphics;
  private playerDialogBubble: Phaser.GameObjects.Container;
  private timeoutID?: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number,
  ) {
    super(scene, x, y, texture, frame);

    this.playerId = id;
    this.playerTexture = texture;
    this.setDepth(this.y);

    this.anims.play(`${this.playerTexture}_idle_down`, true);

    this.playerContainer = this.scene.add
      .container(this.x, this.y - 30)
      .setDepth(5000);

    // add dialogBubble to playerContainer
    this.playerDialogBubble = this.scene.add.container(0, 0).setDepth(5000);
    this.playerContainer.add(this.playerDialogBubble);

    // add playerName to playerContainer
    this.playerName = this.scene.add
      .text(0, 0, "")
      .setFontFamily("Arial")
      .setFontSize(12)
      .setColor("#ffffff")
      .setOrigin(0.5);

    // background capsule and online indicator
    this.playerNameBg = this.scene.add.graphics();
    this.playerOnlineDot = this.scene.add.graphics();
    this.playerContainer.add(this.playerNameBg);
    this.playerContainer.add(this.playerOnlineDot);
    this.playerContainer.add(this.playerName);

    // initialize capsule layout
    this.updateNameCapsule();

    this.scene.physics.world.enable(this.playerContainer);
    const playContainerBody = this.playerContainer
      .body as Phaser.Physics.Arcade.Body;
    const collisionScale = [0.5, 0.2];
    playContainerBody
      .setSize(this.width * collisionScale[0], this.height * collisionScale[1])
      .setOffset(-8, this.height * (1 - collisionScale[1]) + 6);
  }

  updateDialogBubble(content: string) {
    this.clearDialogBubble();

    // preprocessing for dialog bubble text (maximum 70 characters)
    const dialogBubbleText =
      content.length <= 70 ? content : content.substring(0, 70).concat("...");

    const innerText = this.scene.add
      .text(0, 0, dialogBubbleText, {
        wordWrap: { width: 165, useAdvancedWrap: true },
      })
      .setFontFamily("Arial")
      .setFontSize(12)
      .setColor("#000000")
      .setOrigin(0.5);

    // set dialogBox slightly larger than the text in it
    const innerTextHeight = innerText.height;
    const innerTextWidth = innerText.width;

    innerText.setY(-innerTextHeight / 2 - this.playerName.height / 2);
    const dialogBoxWidth = innerTextWidth + 10;
    const dialogBoxHeight = innerTextHeight + 3;
    const dialogBoxX = innerText.x - innerTextWidth / 2 - 5;
    const dialogBoxY = innerText.y - innerTextHeight / 2 - 2;

    this.playerDialogBubble.add(
      this.scene.add
        .graphics()
        .fillStyle(0xffffff, 1)
        .fillRoundedRect(
          dialogBoxX,
          dialogBoxY,
          dialogBoxWidth,
          dialogBoxHeight,
          3,
        )
        .lineStyle(1, 0x000000, 1)
        .strokeRoundedRect(
          dialogBoxX,
          dialogBoxY,
          dialogBoxWidth,
          dialogBoxHeight,
          3,
        ),
    );
    this.playerDialogBubble.add(innerText);

    // After 6 seconds, clear the dialog bubble
    this.timeoutID = window.setTimeout(() => {
      this.clearDialogBubble();
    }, 6000);
  }

  private clearDialogBubble() {
    clearTimeout(this.timeoutID);
    this.playerDialogBubble.removeAll(true);
  }

  protected updateNameCapsule() {
    const paddingX = 8;
    const paddingY = 4;
    const radius = 8;
    const dotRadius = 3;

    const textW = Math.max(16, this.playerName.width);
    const textH = Math.max(12, this.playerName.height);
    const capsuleW = textW + paddingX * 2;
    const capsuleH = textH + paddingY * 2;

    const x = -capsuleW / 2;
    const y = -capsuleH / 2;

    this.playerNameBg?.clear();
    // shadow
    this.playerNameBg?.fillStyle(0x000000, 0.35);
    this.playerNameBg?.fillRoundedRect(
      x + 1.5,
      y + 2,
      capsuleW,
      capsuleH,
      radius,
    );
    // main capsule
    this.playerNameBg?.fillStyle(0x000000, 0.8);
    this.playerNameBg?.fillRoundedRect(x, y, capsuleW, capsuleH, radius);

    // online dot at left inside capsule
    const dotX = x + radius;
    const dotY = y + capsuleH / 2;
    this.playerOnlineDot?.clear();
    // outer glow
    this.playerOnlineDot?.fillStyle(0x00ff55, 0.4);
    this.playerOnlineDot?.fillCircle(dotX, dotY, dotRadius + 2);
    // core
    this.playerOnlineDot?.fillStyle(0x28d17c, 1);
    this.playerOnlineDot?.fillCircle(dotX, dotY, dotRadius);

    // position text slightly to the right to make room for dot
    const textOffsetX = dotRadius + 4;
    this.playerName.setX(textOffsetX);
    this.playerName.setY(0);
  }
}
