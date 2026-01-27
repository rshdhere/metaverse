declare module "colyseus.js" {
  export interface RoomAvailable {
    roomId: string;
    clients: number;
    maxClients?: number;
    metadata?: any;
    name?: string;
  }
}
