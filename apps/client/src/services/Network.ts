import { IPlayer } from "../../types/IOfficeState";
import { ItemType } from "../../types/Items";
import { getTrpcClient } from "../../app/lib/trpc";
import { WS_URL } from "@repo/config/constants";
import { phaserEvents, Event } from "../events/EventCenter";

export default class Network {
  private ws?: WebSocket;
  mySessionId!: string;

  private token?: string;
  private username?: string;
  private myAvatarName: string = "adam";
  private wsEndpoint: string;
  private knownUsers = new Set<string>();
  private userSnapshots = new Map<
    string,
    { x: number; y: number; name?: string }
  >();

  constructor() {
    // Use WS_URL from config (automatically handles dev vs production)
    this.wsEndpoint = WS_URL;

    if (typeof window !== "undefined") {
      this.connectWebSocket();
    }
  }

  setMyAvatarName(name: string) {
    if (typeof name === "string" && name.length > 0) {
      this.myAvatarName = name.toLowerCase();
    }
  }

  getMyAvatarName(): string {
    return this.myAvatarName;
  }

  getUsername(): string | undefined {
    return this.username;
  }

  private connectWebSocket() {
    // Only connect if we have a valid endpoint
    if (!this.wsEndpoint) return;

    try {
      console.log(`Connecting to WebSocket: ${this.wsEndpoint}`);
      this.ws = new WebSocket(this.wsEndpoint);
      this.ws.onopen = () => {
        console.log("WebSocket connected successfully");
      };
      this.ws.onmessage = (evt) => this.handleWsMessage(evt);
      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
      };
      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
    }
  }

  private handleWsMessage(evt: MessageEvent) {
    try {
      const data = JSON.parse(evt.data);
      console.log("WS Message received:", data.type, data.payload);
      switch (data.type) {
        case "space-joined": {
          const sessionId = data.payload?.sessionId;
          console.log("📥 space-joined received, sessionId:", sessionId);
          if (sessionId && typeof sessionId === "string") {
            this.mySessionId = sessionId;
          }
          const users: Array<{
            id?: string;
            userId?: string;
            x: number;
            y: number;
            avatarName?: string;
            name?: string;
          }> = data.payload?.users ?? [];
          console.log("📋 Existing users in space:", users.length, users);
          users.forEach((u) => {
            const uid = u.id || u.userId;
            console.log("👤 Processing existing user:", {
              uid,
              x: u.x,
              y: u.y,
              name: u.name,
              avatarName: u.avatarName,
            });
            if (!uid) {
              console.log("⚠️ Skipping user with no id");
              return;
            }
            if (!this.knownUsers.has(uid)) {
              this.knownUsers.add(uid);
              const x = u.x ?? 0;
              const y = u.y ?? 0;
              this.userSnapshots.set(uid, { x, y, name: u.name || "" });
              const avatar = (u.avatarName || "adam").toLowerCase();
              const other: IPlayer = {
                x,
                y,
                anim: `${avatar}_idle_down`,
                name: u.name || "",
              } as any;
              console.log(
                "🎮 Emitting PLAYER_JOINED for existing user:",
                uid,
                other,
              );
              phaserEvents.emit(Event.PLAYER_JOINED, other, uid);
            } else {
              console.log("⏭️ User already known, skipping:", uid);
            }
          });
          break;
        }
        case "user-join": {
          const { userId, x, y, avatarName, name } = data.payload;
          const uid = userId;
          console.log("user-join received:", {
            uid,
            x,
            y,
            avatarName,
            name,
            alreadyKnown: this.knownUsers.has(uid),
          });
          if (!uid) break;
          if (!this.knownUsers.has(uid)) {
            this.knownUsers.add(uid);
            this.userSnapshots.set(uid, { x, y, name: name || "" });
            const avatar = (avatarName || "adam").toLowerCase();
            const other: IPlayer = {
              x,
              y,
              anim: `${avatar}_idle_down`,
              name: name || "",
            } as any;
            console.log("🎮 Emitting PLAYER_JOINED for:", uid, other);
            phaserEvents.emit(Event.PLAYER_JOINED, other, uid);
          }
          break;
        }
        case "movement": {
          const { userId, x, y, anim } = data.payload;
          if (typeof userId === "string") {
            const prev = this.userSnapshots.get(userId);
            this.userSnapshots.set(userId, { x, y, name: prev?.name });
          }
          phaserEvents.emit(Event.PLAYER_UPDATED, "x", x, userId);
          phaserEvents.emit(Event.PLAYER_UPDATED, "y", y, userId);
          if (typeof anim === "string" && anim.length > 0) {
            phaserEvents.emit(Event.PLAYER_UPDATED, "anim", anim, userId);
          }
          break;
        }
        case "movement-rejected": {
          const { x, y } = data.payload;
          phaserEvents.emit(Event.PLAYER_UPDATED, "x", x, this.mySessionId);
          phaserEvents.emit(Event.PLAYER_UPDATED, "y", y, this.mySessionId);
          break;
        }
        case "join-error": {
          const { error } = data.payload;
          console.error("Failed to join space:", error);
          // Emit an event so UI can show the error
          phaserEvents.emit("JOIN_ERROR", error);
          break;
        }
        case "user-left": {
          const { userId } = data.payload;
          if (this.knownUsers.has(userId)) this.knownUsers.delete(userId);
          this.userSnapshots.delete(userId);
          phaserEvents.emit(Event.PLAYER_LEFT, userId);
          break;
        }
        default:
          break;
      }
    } catch {}
  }

  async joinOrCreatePublic() {
    if (!this.token) {
      const fallback =
        this.username || `guest-${Math.random().toString(36).slice(2, 8)}`;
      await this.signInOrUp(fallback);
    }

    // Try to get existing space or create default
    const spaceId = await this.getOrCreateDefaultSpace();

    // Wait for WebSocket to be open (with timeout)
    const maxWaitMs = 5000;
    const pollInterval = 100;
    let waited = 0;

    while (
      (!this.ws || this.ws.readyState !== WebSocket.OPEN) &&
      waited < maxWaitMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.token) {
      console.log("📤 Sending join request for space:", spaceId);
      this.ws.send(
        JSON.stringify({
          type: "join",
          payload: {
            spaceId,
            token: this.token,
            name: this.username || "Guest",
            avatarName: this.myAvatarName,
          },
        }),
      );
    } else {
      console.error("Cannot join space: WebSocket not connected or no token");
      console.error("  - WS exists:", !!this.ws);
      console.error("  - WS readyState:", this.ws?.readyState);
      console.error("  - Has token:", !!this.token);
      phaserEvents.emit("JOIN_ERROR", "WebSocket connection failed");
    }
    phaserEvents.emit(Event.MY_PLAYER_READY);
  }

  async createRoom(
    name: string,
    dimensions = "50x50",
    mapId?: string,
  ): Promise<string> {
    const client = getTrpcClient();
    const { spaceId } = await client.space.create.mutate({
      name,
      dimensions,
      mapId,
    });
    return spaceId;
  }

  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "movement",
          payload: { x: currentX, y: currentY, anim: currentAnim },
        }),
      );
    }
  }

  async updatePlayerName(currentName: string) {
    this.username = currentName;
    if (!this.token) {
      await this.signInOrUp(currentName);
    }
  }

  applyAuth(token: string, username?: string) {
    this.token = token;
    if (username) this.username = username;

    // Store token in localStorage so tRPC client can access it
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
      if (username) localStorage.setItem("username", username);
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      this.mySessionId = payload.userId;
    } catch {}
  }

  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any,
  ) {
    phaserEvents.on("ITEM_USER_ADDED", callback.bind(context));
  }

  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any,
  ) {
    phaserEvents.on("ITEM_USER_REMOVED", callback.bind(context));
  }

  onPlayerJoined(
    callback: (Player: IPlayer, key: string) => void,
    context?: any,
  ) {
    phaserEvents.on(Event.PLAYER_JOINED, callback.bind(context));
  }

  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback.bind(context));
  }

  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback.bind(context));
  }

  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any,
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback.bind(context));
  }

  connectToComputer(id: string) {
    console.log("Connect to computer:", id);
    // TODO: Implement computer connection logic or emit event
  }

  private async signInOrUp(username: string) {
    const password = "password";
    // Fallback email generation for guest/simple usage if no @ present
    const email = username.includes("@")
      ? username
      : `${username}@metaverse.local`;

    const client = getTrpcClient();

    try {
      // 1. Try to signup first
      try {
        await client.user.signup.mutate({ email, password });
        // Signup success, now we can login
      } catch (err: any) {
        // Ignore conflict errors (user already exists), proceed to login
      }

      // 2. Login to get token
      const res = await client.user.login.mutate({ email, password });
      this.token = res.token;

      // Store token in localStorage so subsequent tRPC calls work
      if (typeof window !== "undefined" && this.token) {
        localStorage.setItem("token", this.token);
        localStorage.setItem("username", username);
      }

      if (this.token) {
        try {
          const payload = JSON.parse(atob(this.token.split(".")[1]));
          this.mySessionId = payload.userId;
        } catch {}
      }
    } catch (e) {
      console.error("Auth failed:", e);
    }
  }

  private async getOrCreateDefaultSpace(): Promise<string> {
    // Use a fixed public space ID so ALL users join the same room
    // This ensures multiplayer works - everyone sees each other
    const PUBLIC_SPACE_ID = "public-lobby";
    console.log("🏠 Joining shared public space:", PUBLIC_SPACE_ID);
    return PUBLIC_SPACE_ID;
  }
}
