import * as Phaser from "phaser";
import Preloader from "../scenes/Preloader";
import Game from "../scenes/Game";

let phaserGame: Phaser.Game | null = null;

export function ensurePhaser() {
  if (typeof window === "undefined") return null;
  if (phaserGame) return phaserGame;
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "phaser-container",
    backgroundColor: "#2d3250",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.ScaleModes.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    autoFocus: true,
    scene: [Preloader, Game],
  };
  phaserGame = new Phaser.Game(config);
  (window as unknown as { game?: Phaser.Game }).game = phaserGame;
  return phaserGame;
}

export function destroyPhaserGame() {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
    (window as unknown as { game?: Phaser.Game }).game = undefined;
  }
}

export default ensurePhaser;
