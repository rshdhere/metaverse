import { IPlayer } from "../../types/IOfficeState";
import { ItemType } from "../../types/Items";
import { getTrpcClient } from "../../app/lib/trpc";
import { WS_URL } from "@repo/config/constants";
import { phaserEvents, Event } from "../events/EventCenter";

// Types for queued events
type QueuedEvent =
  | { type: "PLAYER_JOINED"; player: IPlayer; id: string }
  | { type: "PLAYER_LEFT"; id: string }
  | {
      type: "PLAYER_UPDATED";
      field: string;
      value: number | string;
      id: string;
    };

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

  // Event queue for buffering events until Game scene is ready
  private eventQueue: QueuedEvent[] = [];
  private gameSceneReady = false;

  // Track players that have been successfully created in the Game scene
  private createdPlayers = new Set<string>();

  // Prevent multiple join attempts
  private joinInProgress = false;
  private hasJoinedSpace = false;

  // Current position tracking for persistence
  private currentPosition: { x: number; y: number } | null = null;
  private currentSpaceId: string | null = null;

  constructor() {
    // Use WS_URL from config (automatically handles dev vs production)
    this.wsEndpoint = WS_URL;

    if (typeof window !== "undefined") {
      this.connectWebSocket();

      // Save position to localStorage when tab is closing
      window.addEventListener("beforeunload", () => {
        this.savePositionToStorage();
      });

      // Also save on visibility change (mobile browsers)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.savePositionToStorage();
        }
      });
    }
  }

  /**
   * Save current position to localStorage for persistence across tab closes.
   */
  private savePositionToStorage() {
    if (this.currentPosition && this.currentSpaceId && this.mySessionId) {
      const positionData = {
        x: this.currentPosition.x,
        y: this.currentPosition.y,
        spaceId: this.currentSpaceId,
        userId: this.mySessionId,
        timestamp: Date.now(),
      };
      localStorage.setItem("lastPlayerPosition", JSON.stringify(positionData));
      console.log("💾 Position saved:", positionData);
    }
  }

  /**
   * Retrieve last saved position from localStorage.
   * Returns null if no valid position exists or if it's too old (>24 hours).
   */
  getLastPosition(spaceId: string): { x: number; y: number } | null {
    try {
      const saved = localStorage.getItem("lastPlayerPosition");
      if (!saved) return null;

      const data = JSON.parse(saved);
      // Only use position if it's for the same space and less than 24 hours old
      if (
        data.spaceId === spaceId &&
        data.userId === this.mySessionId &&
        Date.now() - data.timestamp < 24 * 60 * 60 * 1000
      ) {
        console.log("📍 Restored last position:", data.x, data.y);
        return { x: data.x, y: data.y };
      }
    } catch {
      // Invalid data, ignore
    }
    return null;
  }

  /**
   * Update current position (called by MyPlayer during movement).
   */
  updatePosition(x: number, y: number) {
    this.currentPosition = { x, y };
  }

  /**
   * Set the current space ID for position persistence.
   */
  setCurrentSpaceId(spaceId: string) {
    this.currentSpaceId = spaceId;
  }

  /**
   * Reset all state when joining a new space or reconnecting.
   * This ensures no stale data causes issues.
   */
  resetState() {
    console.log("🔄 Network.resetState() - Clearing all player state");
    this.knownUsers.clear();
    this.userSnapshots.clear();
    this.eventQueue = [];
    this.createdPlayers.clear();
    // Note: gameSceneReady, joinInProgress, hasJoinedSpace are NOT reset here
    // as we want to preserve connection state across space-joined events
  }

  /**
   * Called by Game scene when it has finished registering event listeners.
   * Flushes all queued events to ensure no player joins are missed.
   */
  setGameSceneReady() {
    if (this.gameSceneReady) {
      // Already ready - but still flush any pending events
      console.log(
        `🎯 Game scene already ready. Flushing ${this.eventQueue.length} pending events.`,
      );
    } else {
      console.log(
        `🎯 Game scene now ready. Flushing ${this.eventQueue.length} queued events.`,
      );
      this.gameSceneReady = true;
    }

    // Always flush queued events
    this.flushEventQueue();
  }

  /**
   * Flush all queued events in order.
   */
  private flushEventQueue() {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      this.emitEvent(event);
    }
  }

  /**
   * Emit an event immediately if Game scene is ready, otherwise queue it.
   */
  private queueOrEmit(event: QueuedEvent) {
    if (this.gameSceneReady) {
      this.emitEvent(event);
    } else {
      console.log(`📦 Queuing event (scene not ready):`, event.type, event.id);
      this.eventQueue.push(event);
    }
  }

  /**
   * Actually emit the event to Phaser event system.
   * Includes deduplication for PLAYER_JOINED events.
   */
  private emitEvent(event: QueuedEvent) {
    switch (event.type) {
      case "PLAYER_JOINED":
        // Prevent duplicate player creation
        if (this.createdPlayers.has(event.id)) {
          console.log("⏭️ Player already created, skipping:", event.id);
          return;
        }
        console.log("🎮 Emitting PLAYER_JOINED:", event.id, event.player);
        this.createdPlayers.add(event.id);
        phaserEvents.emit(Event.PLAYER_JOINED, event.player, event.id);
        break;
      case "PLAYER_LEFT":
        this.createdPlayers.delete(event.id);
        phaserEvents.emit(Event.PLAYER_LEFT, event.id);
        break;
      case "PLAYER_UPDATED":
        phaserEvents.emit(
          Event.PLAYER_UPDATED,
          event.field,
          event.value,
          event.id,
        );
        break;
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

          // Reset state to clear any stale player data from previous join attempts
          this.resetState();

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
            if (!uid) return;
            if (!this.knownUsers.has(uid)) {
              this.knownUsers.add(uid);
              const x = u.x ?? 0;
              const y = u.y ?? 0;
              this.userSnapshots.set(uid, { x, y, name: u.name || "" });
              const avatar = (u.avatarName || "adam").toLowerCase();
              const player: IPlayer = {
                x,
                y,
                anim: `${avatar}_idle_down`,
                name: u.name || "",
              } as IPlayer;
              // Queue or emit immediately based on Game scene readiness
              this.queueOrEmit({ type: "PLAYER_JOINED", player, id: uid });
            }
          });
          break;
        }
        case "user-join": {
          const { userId, x, y, avatarName, name } = data.payload;
          const uid = userId;
          console.log("user-join received:", { uid, x, y, avatarName, name });
          if (!uid) break;
          if (!this.knownUsers.has(uid)) {
            this.knownUsers.add(uid);
            this.userSnapshots.set(uid, { x, y, name: name || "" });
            const avatar = (avatarName || "adam").toLowerCase();
            const player: IPlayer = {
              x,
              y,
              anim: `${avatar}_idle_down`,
              name: name || "",
            } as IPlayer;
            // Queue or emit immediately based on Game scene readiness
            this.queueOrEmit({ type: "PLAYER_JOINED", player, id: uid });
          }
          break;
        }
        case "movement": {
          const { userId, x, y, anim } = data.payload;
          if (typeof userId === "string") {
            const prev = this.userSnapshots.get(userId);
            this.userSnapshots.set(userId, { x, y, name: prev?.name });
          }
          // Movement updates are emitted immediately (player already exists)
          // But still use queue system for consistency
          this.queueOrEmit({
            type: "PLAYER_UPDATED",
            field: "x",
            value: x,
            id: userId,
          });
          this.queueOrEmit({
            type: "PLAYER_UPDATED",
            field: "y",
            value: y,
            id: userId,
          });
          if (typeof anim === "string" && anim.length > 0) {
            this.queueOrEmit({
              type: "PLAYER_UPDATED",
              field: "anim",
              value: anim,
              id: userId,
            });
          }
          break;
        }
        case "movement-rejected": {
          const { x, y } = data.payload;
          // Movement rejection goes directly to correct my own position
          phaserEvents.emit(Event.PLAYER_UPDATED, "x", x, this.mySessionId);
          phaserEvents.emit(Event.PLAYER_UPDATED, "y", y, this.mySessionId);
          break;
        }
        case "join-error": {
          const { error } = data.payload;
          console.error("Failed to join space:", error);
          phaserEvents.emit("JOIN_ERROR", error);
          break;
        }
        case "user-left": {
          const { userId } = data.payload;
          if (this.knownUsers.has(userId)) this.knownUsers.delete(userId);
          this.userSnapshots.delete(userId);
          this.queueOrEmit({ type: "PLAYER_LEFT", id: userId });
          break;
        }
        default:
          break;
      }
    } catch {}
  }

  async joinOrCreatePublic() {
    // Prevent multiple concurrent join attempts
    if (this.joinInProgress) {
      console.log("⏸️ Join already in progress, skipping duplicate request");
      return;
    }

    // Prevent re-joining if already joined (unless explicitly reset)
    if (this.hasJoinedSpace) {
      console.log("✅ Already joined space, skipping duplicate join");
      return;
    }

    this.joinInProgress = true;

    try {
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
        this.hasJoinedSpace = true;
      } else {
        console.error("Cannot join space: WebSocket not connected or no token");
        console.error("  - WS exists:", !!this.ws);
        console.error("  - WS readyState:", this.ws?.readyState);
        console.error("  - Has token:", !!this.token);
        phaserEvents.emit("JOIN_ERROR", "WebSocket connection failed");
      }
    } finally {
      this.joinInProgress = false;
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
