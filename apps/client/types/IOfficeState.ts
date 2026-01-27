export interface IPlayer {
  name: string;
  x: number;
  y: number;
  anim: string;
  readyToConnect: boolean;
  videoConnected: boolean;
}

export interface IOfficeState {
  myPlayerAttendeeId: string | null;
}
