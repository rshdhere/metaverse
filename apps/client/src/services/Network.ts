import { IPlayer } from "../../types/IOfficeState";
import { ItemType } from "../../types/Items";
import { getTrpcClient } from "../../app/lib/trpc";
import { WS_URL } from "@repo/config/constants";
import { phaserEvents, Event } from "../events/EventCenter";
import MediaSession from "./MediaSession";
import { toast } from "sonner";

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
  private myAvatarName: string = "harry";
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
  private mediaSession?: MediaSession;

  constructor() {
    // Use WS_URL from config (automatically handles dev vs production)
    this.wsEndpoint = WS_URL;

    if (typeof window !== "undefined") {
      this.mediaSession = new MediaSession(this); // Pass network instance to MediaSession
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
    }
  }

  /**
   * Full reset for re-joining a space after returning to the arena.
   * This clears ALL state including join flags, allowing a fresh join.
   */
  resetForRejoin() {
    this.knownUsers.clear();
    this.userSnapshots.clear();
    this.eventQueue = [];
    this.createdPlayers.clear();
    this.hasJoinedSpace = false;
    this.joinInProgress = false;
    this.gameSceneReady = false;
    this.currentPosition = null;
    this.currentSpaceId = null;
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
    this.knownUsers.clear();
    this.userSnapshots.clear();
    this.eventQueue = [];
    this.createdPlayers.clear();
    this.mediaSession?.reset();
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
    } else {
      this.gameSceneReady = true;
    }

    // Ensure meeting prompts are enabled when the game UI is ready.
    this.setMeetingToastEnabled(true);

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
          return;
        }

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
      this.ws = new WebSocket(this.wsEndpoint);
      this.ws.onopen = () => {};
      this.ws.onmessage = (evt) => this.handleWsMessage(evt);
      this.ws.onclose = () => {
        toast.error("Connection lost", {
          description: "Please refresh to reconnect.",
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          },
          duration: Infinity,
        });
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

      switch (data.type) {
        case "space-joined": {
          const sessionId = data.payload?.sessionId;

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

          users.forEach((u) => {
            const uid = u.id || u.userId;
            if (!uid) return;
            if (!this.knownUsers.has(uid)) {
              this.knownUsers.add(uid);
              const x = u.x ?? 0;
              const y = u.y ?? 0;
              this.userSnapshots.set(uid, { x, y, name: u.name || "" });
              const avatar = (u.avatarName || "ron").toLowerCase();
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

          if (!uid) break;
          if (!this.knownUsers.has(uid)) {
            this.knownUsers.add(uid);
            this.userSnapshots.set(uid, { x, y, name: name || "" });
            const avatar = (avatarName || "ron").toLowerCase();
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
          this.mediaSession?.handlePeerLeft(userId); // Forward to MediaSession
          break;
        }

        // --- PROXIMITY & MEETING EVENTS ---

        case "meeting-prompt": {
          // payload: { requestId, expiresAt, peerId }
          this.mediaSession?.handleMeetingPrompt(data.payload);
          break;
        }

        case "meeting-start": {
          // payload: { peerId }
          // Both sides receive this. Start media.
          this.mediaSession?.handleMeetingStart(data.payload);
          break;
        }

        case "meeting-end": {
          // payload: { peerId, reason }
          this.mediaSession?.handleMeetingEnd(data.payload);
          break;
        }

        case "proximity-update": {
          // payload: { type: 'enter'|'leave', media: 'audio'|'video', peerId }
          this.mediaSession?.handleProximityUpdate(data.payload);
          break;
        }

        case "camera-toggle": {
          this.mediaSession?.handleCameraToggle(data.payload);
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
      return;
    }

    // Prevent re-joining if already joined (unless explicitly reset)
    if (this.hasJoinedSpace) {
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

  // Teleport player to a specific location (used for meeting navigation)
  // This bypasses server step validation but still checks collisions
  teleportPlayer(targetX: number, targetY: number, anim: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "teleport",
          payload: { x: targetX, y: targetY, anim },
        }),
      );
    }
  }

  // Send meeting response (accept/decline)
  // Send meeting response (accept/decline)
  sendMeetingResponse(requestId: string, accept: boolean, peerId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "meeting-response",
          payload: { requestId, accept, peerId },
        }),
      );
    }
  }

  sendCameraToggle(enabled: boolean) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "camera-toggle",
          payload: { enabled },
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

    this.ensureMediaSessionStarted();
  }

  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: object,
  ) {
    phaserEvents.on("ITEM_USER_ADDED", callback.bind(context));
  }

  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: object,
  ) {
    phaserEvents.on("ITEM_USER_REMOVED", callback.bind(context));
  }

  onPlayerJoined(
    callback: (Player: IPlayer, key: string) => void,
    context?: object,
  ) {
    phaserEvents.on(Event.PLAYER_JOINED, callback.bind(context));
  }

  onPlayerLeft(callback: (key: string) => void, context?: object) {
    phaserEvents.on(Event.PLAYER_LEFT, callback.bind(context));
  }

  onMyPlayerReady(callback: (key: string) => void, context?: object) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback.bind(context));
  }

  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: object,
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback.bind(context));
  }

  onMeetingAccepted(callback: (fromUserId: string) => void, context?: object) {
    phaserEvents.on(Event.MEETING_ACCEPTED, callback.bind(context));
  }

  connectToComputer(_id: string) {
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
      } catch {
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

      this.ensureMediaSessionStarted();
    } catch (e) {
      console.error("Auth failed:", e);
    }
  }

  private async getOrCreateDefaultSpace(): Promise<string> {
    // Use a fixed public space ID so ALL users join the same room
    // This ensures multiplayer works - everyone sees each other
    const PUBLIC_SPACE_ID = "public-lobby";

    return PUBLIC_SPACE_ID;
  }

  private ensureMediaSessionStarted() {
    if (!this.mediaSession) return;
    this.mediaSession.start().catch((error) => {
      console.error("Failed to initialize media session:", error);
    });
  }

  setVideoContainers(
    remoteContainer: HTMLElement | null,
    localContainer: HTMLElement | null,
  ) {
    this.mediaSession?.setVideoContainers(remoteContainer, localContainer);
  }

  setMeetingToastEnabled(enabled: boolean) {
    this.mediaSession?.setMeetingToastEnabled(enabled);
  }

  async enableCamera() {
    await this.mediaSession?.enableCamera();
  }

  disableCamera() {
    this.mediaSession?.disableCamera();
  }

  isCameraEnabled() {
    return this.mediaSession?.isCameraEnabled() ?? false;
  }

  getMySessionId() {
    return this.mySessionId;
  }

  async toggleMicrophone() {
    return this.mediaSession?.toggleMicrophone() ?? false;
  }

  isMicrophoneEnabled() {
    return this.mediaSession?.isMicrophoneEnabled() ?? false;
  }

  getPeerName(peerId: string): string {
    return this.userSnapshots.get(peerId)?.name || "Unknown";
  }

  isPeerCameraEnabled(peerId: string): boolean {
    return this.mediaSession?.isPeerCameraEnabled(peerId) ?? false;
  }

  hasActiveVideoForPeer(peerId: string): boolean {
    return this.mediaSession?.hasActiveVideoForPeer(peerId) ?? false;
  }

  getPeerAudioStatus(peerId: string): boolean {
    return this.mediaSession?.hasAudioForPeer(peerId) ?? false;
  }

  getActiveMeetingPeers() {
    return this.mediaSession?.getActiveMeetingPeers() ?? [];
  }

  getRemoteVideoCount() {
    return this.mediaSession?.getRemoteVideoCount() ?? 0;
  }

  async endMeetings() {
    const peers = this.getActiveMeetingPeers();
    if (peers.length === 0) return;

    for (const peerId of peers) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "meeting-end",
            payload: { peerId },
          }),
        );
      }
      // Clean up locally immediately
      this.mediaSession?.handleMeetingEnd({ peerId, reason: "local-leave" });
    }
  }

  /**
   * E2E only: simulate a proximity-update (e.g. another avatar came close so we can listen).
   * Only callable when Cypress is running. Returns a promise so tests can await completion.
   */
  simulateProximityUpdate(payload: {
    type: "enter" | "leave";
    media: "audio" | "video";
    peerId: string;
  }): Promise<void> {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { Cypress?: unknown }).Cypress
    ) {
      return (
        this.mediaSession?.handleProximityUpdate(payload) ?? Promise.resolve()
      );
    }
    return Promise.resolve();
  }
}
