import Phaser from "phaser";

export const createCharacterAnims = (
  anims: Phaser.Animations.AnimationManager,
) => {
  const animsFrameRate = 15;

  anims.create({
    key: "hermoine_idle_right",
    frames: anims.generateFrameNames("hermoine", {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "hermoine_idle_up",
    frames: anims.generateFrameNames("hermoine", {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "hermoine_idle_left",
    frames: anims.generateFrameNames("hermoine", {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "hermoine_idle_down",
    frames: anims.generateFrameNames("hermoine", {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "hermoine_run_right",
    frames: anims.generateFrameNames("hermoine", {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_run_up",
    frames: anims.generateFrameNames("hermoine", {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_run_left",
    frames: anims.generateFrameNames("hermoine", {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_run_down",
    frames: anims.generateFrameNames("hermoine", {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_sit_down",
    frames: anims.generateFrameNames("hermoine", {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_sit_left",
    frames: anims.generateFrameNames("hermoine", {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_sit_right",
    frames: anims.generateFrameNames("hermoine", {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "hermoine_sit_up",
    frames: anims.generateFrameNames("hermoine", {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_idle_right",
    frames: anims.generateFrameNames("ginny", {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ginny_idle_up",
    frames: anims.generateFrameNames("ginny", {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ginny_idle_left",
    frames: anims.generateFrameNames("ginny", {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ginny_idle_down",
    frames: anims.generateFrameNames("ginny", {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ginny_run_right",
    frames: anims.generateFrameNames("ginny", {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_run_up",
    frames: anims.generateFrameNames("ginny", {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_run_left",
    frames: anims.generateFrameNames("ginny", {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_run_down",
    frames: anims.generateFrameNames("ginny", {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_sit_down",
    frames: anims.generateFrameNames("ginny", {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_sit_left",
    frames: anims.generateFrameNames("ginny", {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_sit_right",
    frames: anims.generateFrameNames("ginny", {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ginny_sit_up",
    frames: anims.generateFrameNames("ginny", {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_idle_right",
    frames: anims.generateFrameNames("harry", {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "harry_idle_up",
    frames: anims.generateFrameNames("harry", {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "harry_idle_left",
    frames: anims.generateFrameNames("harry", {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "harry_idle_down",
    frames: anims.generateFrameNames("harry", {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "harry_run_right",
    frames: anims.generateFrameNames("harry", {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_run_up",
    frames: anims.generateFrameNames("harry", {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_run_left",
    frames: anims.generateFrameNames("harry", {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_run_down",
    frames: anims.generateFrameNames("harry", {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_sit_down",
    frames: anims.generateFrameNames("harry", {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_sit_left",
    frames: anims.generateFrameNames("harry", {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_sit_right",
    frames: anims.generateFrameNames("harry", {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "harry_sit_up",
    frames: anims.generateFrameNames("harry", {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_idle_right",
    frames: anims.generateFrameNames("ron", {
      start: 0,
      end: 5,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ron_idle_up",
    frames: anims.generateFrameNames("ron", {
      start: 6,
      end: 11,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ron_idle_left",
    frames: anims.generateFrameNames("ron", {
      start: 12,
      end: 17,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ron_idle_down",
    frames: anims.generateFrameNames("ron", {
      start: 18,
      end: 23,
    }),
    repeat: -1,
    frameRate: animsFrameRate * 0.6,
  });

  anims.create({
    key: "ron_run_right",
    frames: anims.generateFrameNames("ron", {
      start: 24,
      end: 29,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_run_up",
    frames: anims.generateFrameNames("ron", {
      start: 30,
      end: 35,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_run_left",
    frames: anims.generateFrameNames("ron", {
      start: 36,
      end: 41,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_run_down",
    frames: anims.generateFrameNames("ron", {
      start: 42,
      end: 47,
    }),
    repeat: -1,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_sit_down",
    frames: anims.generateFrameNames("ron", {
      start: 48,
      end: 48,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_sit_left",
    frames: anims.generateFrameNames("ron", {
      start: 49,
      end: 49,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_sit_right",
    frames: anims.generateFrameNames("ron", {
      start: 50,
      end: 50,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });

  anims.create({
    key: "ron_sit_up",
    frames: anims.generateFrameNames("ron", {
      start: 51,
      end: 51,
    }),
    repeat: 0,
    frameRate: animsFrameRate,
  });
};
