import { Device, types } from "mediasoup-client";
import { toast } from "sonner";
import { getTrpcClient } from "../../app/lib/trpc";
import { phaserEvents, Event } from "../events/EventCenter";
import Network from "./Network";

type ProximityAction =
  | {
      type: "consume";
      producerId: string;
      producerUserId: string;
      kind: "audio" | "video";
    }
  | {
      type: "stop" | "pause" | "resume";
      producerId: string;
      producerUserId: string;
      kind: "audio" | "video";
    }
  | {
      type: "meetingPrompt";
      peerId: string;
      requestId?: string;
      meetingId?: string;
      expiresAt?: number;
    }
  | {
      type: "meetingStart";
      peerId: string;
      meetingId?: string;
    }
  | {
      type: "meetingEnd";
      peerId: string;
      meetingId?: string;
    };

export default class MediaSession {
  private device?: Device;
  private sendTransport?: types.Transport;
  private recvTransport?: types.Transport;
  private audioProducer?: types.Producer;
  private videoProducer?: types.Producer;
  private videoProducerId?: string;
  private localVideoStream?: MediaStream;
  private localVideoElement?: HTMLVideoElement;
  private consumersByProducerId = new Map<string, types.Consumer>();
  private audioElementsByProducerId = new Map<string, HTMLAudioElement>();
  private videoElementsByProducerId = new Map<string, HTMLVideoElement>();
  private pausedProducerIds = new Set<string>();
  private producerOwners = new Map<string, string>();
  private remoteVideoContainer: HTMLElement | null = null;
  private localVideoContainer: HTMLElement | null = null;
  private started = false;
  // Polling removed
  private pendingActions: ProximityAction[] = [];
  private cameraEnabled = false;
  private maxVideoConsumers = 4;
  private toastEnabled = false;
  private pendingMeetingPrompts = new Map<
    string,
    {
      type: "meetingPrompt";
      peerId: string;
      requestId?: string;
      meetingId?: string;
      expiresAt?: number;
    }
  >();
  private meetingPrompts = new Map<
    string,
    { toastId: string | number; timeoutId: number }
  >();
  private network: Network;
  private activeMeetingPeers = new Set<string>(); // Legacy, removing
  private peerStates = new Map<
    string,
    { status: "IDLE" | "PROMPTED" | "ACTIVE"; meetingId?: string }
  >();

  constructor(network: Network) {
    this.network = network;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    try {
      await this.initializeDeviceAndTransports();
      await this.flushPendingActions();
      this.flushPendingMeetingPrompts();

      try {
        await this.startMicrophone();
      } catch (error) {
        console.warn(
          "Failed to start microphone (permissions might be denied):",
          error,
        );
      }
    } catch (error) {
      console.error("Failed to start MediaSession (critical error):", error);
    }
  }

  private async initializeDeviceAndTransports() {
    const client = getTrpcClient();
    const { routerRtpCapabilities } =
      await client.mediasoup.createDevice.query();

    this.device = new Device();
    await this.device.load({
      routerRtpCapabilities: routerRtpCapabilities as types.RtpCapabilities,
    });

    const sendTransportInfo = await client.mediasoup.createTransport.mutate({
      direction: "send",
    });
    this.sendTransport = this.device.createSendTransport(
      sendTransportInfo as types.TransportOptions,
    );
    this.bindTransportEvents(this.sendTransport);

    const recvTransportInfo = await client.mediasoup.createTransport.mutate({
      direction: "recv",
    });
    this.recvTransport = this.device.createRecvTransport(
      recvTransportInfo as types.TransportOptions,
    );
    this.bindTransportEvents(this.recvTransport);
  }

  private bindTransportEvents(transport: types.Transport) {
    const client = getTrpcClient();
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await client.mediasoup.connectTransport.mutate({
          transportId: transport.id,
          dtlsParameters,
        });
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    if (transport.direction === "send") {
      transport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const { producerId } = await client.mediasoup.produce.mutate({
              transportId: transport.id,
              kind,
              rtpParameters,
              appData,
            });
            callback({ id: producerId });
          } catch (error) {
            errback(error as Error);
          }
        },
      );
    }
  }

  private async startMicrophone() {
    if (!this.sendTransport || this.audioProducer) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    const track = stream.getAudioTracks()[0];
    if (!track) {
      console.warn("No audio track available for production");
      return;
    }

    this.audioProducer = await this.sendTransport.produce({ track });
  }

  async enableCamera() {
    if (this.cameraEnabled) return;
    if (!this.started) {
      await this.start();
    }
    if (!this.sendTransport || this.videoProducer) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      console.warn("No video track available for production");
      return;
    }

    track.onended = () => {
      this.disableCamera();
    };

    this.localVideoStream = stream;
    this.videoProducer = await this.sendTransport.produce({ track });
    this.videoProducerId = this.videoProducer.id;
    this.cameraEnabled = true;

    this.attachLocalPreview(stream);
  }

  disableCamera() {
    if (!this.cameraEnabled) return;
    this.cameraEnabled = false;

    if (this.videoProducer) {
      this.videoProducer.close();
      this.videoProducer = undefined;
    }

    if (this.videoProducerId) {
      const producerId = this.videoProducerId;
      this.videoProducerId = undefined;
      const client = getTrpcClient();
      client.mediasoup.closeProducer.mutate({ producerId }).catch((error) => {
        console.error("Failed to close video producer:", error);
      });
    }

    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((track) => track.stop());
      this.localVideoStream = undefined;
    }

    if (this.localVideoElement) {
      this.localVideoElement.srcObject = null;
      this.localVideoElement.remove();
      this.localVideoElement = undefined;
    }
  }

  isCameraEnabled() {
    return this.cameraEnabled;
  }

  setVideoContainers(
    remoteContainer: HTMLElement | null,
    localContainer: HTMLElement | null,
  ) {
    this.remoteVideoContainer = remoteContainer;
    this.localVideoContainer = localContainer;

    if (this.localVideoStream && this.localVideoElement && localContainer) {
      if (!localContainer.contains(this.localVideoElement)) {
        localContainer.appendChild(this.localVideoElement);
      }
    }

    if (remoteContainer) {
      console.log(
        `🎥 MediaSession: Attaching ${this.videoElementsByProducerId.size} remote videos to container`,
      );
      for (const [producerId, video] of this.videoElementsByProducerId) {
        if (this.pausedProducerIds.has(producerId)) continue;

        let justAppended = false;
        if (!remoteContainer.contains(video)) {
          console.log("Adding remote video to container:", producerId);
          remoteContainer.appendChild(video);
          justAppended = true;
        }

        // Force play interaction for autoplay policies
        if (video.paused || justAppended) {
          video
            .play()
            .catch((e) =>
              console.warn(`Video ${producerId} play retry failed:`, e),
            );
        }
      }
    } else {
      console.log(
        "🎥 MediaSession: No remote container available to attach videos",
      );
    }
  }

  setMeetingToastEnabled(enabled: boolean) {
    this.toastEnabled = enabled;
    if (enabled) {
      this.flushPendingMeetingPrompts();
    }
  }

  private flushPendingMeetingPrompts() {
    if (!this.toastEnabled) return;
    const now = Date.now();
    for (const [requestId, action] of this.pendingMeetingPrompts.entries()) {
      const expiresAt = action.expiresAt ?? now;
      if (expiresAt <= now) {
        this.pendingMeetingPrompts.delete(requestId);
        continue;
      }
      this.pendingMeetingPrompts.delete(requestId);
      void this.handleMeetingPrompt(action);
    }
  }

  private async handleActions(actions: ProximityAction[]) {
    const canHandleMedia = !!this.device && !!this.recvTransport;
    for (const action of actions) {
      switch (action.type) {
        case "consume":
          if (!canHandleMedia) {
            this.pendingActions.push(action);
            break;
          }
          await this.consumeProducer(
            action.producerId,
            action.kind,
            action.producerUserId,
          );
          break;
        case "resume":
          if (!canHandleMedia) {
            this.pendingActions.push(action);
            break;
          }
          await this.resumeConsumer(
            action.producerId,
            action.kind,
            action.producerUserId,
          );
          break;
        case "pause":
          if (!canHandleMedia) {
            this.pendingActions.push(action);
            break;
          }
          await this.pauseConsumer(
            action.producerId,
            action.kind,
            action.producerUserId,
          );
          break;
        case "stop":
          if (!canHandleMedia) {
            this.pendingActions.push(action);
            break;
          }
          await this.stopConsumer(action.producerId, action.kind);
          break;
        case "meetingPrompt":
          await this.handleMeetingPrompt(action);
          break;
        case "meetingStart":
          await this.handleMeetingStart(action);
          break;
        case "meetingEnd":
          await this.handleMeetingEnd(action);
          break;
        default:
          break;
      }
    }
  }

  private async flushPendingActions() {
    if (!this.device || !this.recvTransport) return;
    if (this.pendingActions.length === 0) return;
    const actions = [...this.pendingActions];
    this.pendingActions = [];
    await this.handleActions(actions);
  }

  private async consumeProducer(
    producerId: string,
    kind: "audio" | "video",
    producerUserId: string,
  ) {
    if (!this.device || !this.recvTransport) return;
    if (this.consumersByProducerId.has(producerId)) {
      await this.resumeConsumer(producerId, kind, producerUserId);
      return;
    }

    if (
      kind === "video" &&
      this.videoElementsByProducerId.size >= this.maxVideoConsumers
    ) {
      console.warn(
        "Video consumer limit reached, skipping producer",
        producerId,
      );
      return;
    }

    console.log(
      "Consuming producer:",
      producerId,
      "kind:",
      kind,
      "user:",
      producerUserId,
    );

    const client = getTrpcClient();
    const consumerInfo = await client.mediasoup.consume.mutate({
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume({
      id: consumerInfo.id,
      producerId: consumerInfo.producerId,
      kind: consumerInfo.kind,
      rtpParameters: consumerInfo.rtpParameters as types.RtpParameters,
    });

    this.consumersByProducerId.set(producerId, consumer);
    this.producerOwners.set(producerId, producerUserId);

    consumer.on("transportclose", () => {
      this.cleanupConsumer(producerId);
    });

    (consumer as unknown as { on: (event: string, cb: () => void) => void }).on(
      "producerclose",
      () => {
        this.cleanupConsumer(producerId);
      },
    );

    if (consumer.kind === "audio") {
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = new MediaStream([consumer.track]);
      audio.play().catch(() => {
        // Autoplay can be blocked until user interacts with the page.
      });
      this.audioElementsByProducerId.set(producerId, audio);
    } else if (consumer.kind === "video") {
      const video = document.createElement("video");
      video.setAttribute("autoplay", "true");
      video.setAttribute("playsinline", "true");
      video.setAttribute("muted", "true"); // Attribute for initial parsing
      video.autoplay = true;
      video.playsInline = true;

      video.controls = false; // Ensure controls don't appear
      video.srcObject = new MediaStream([consumer.track]);
      video.className =
        "w-full aspect-video rounded-xl border-2 border-white/10 bg-zinc-900/90 object-cover shadow-2xl transition-all hover:border-white/20 cursor-pointer block";

      // Video debugging
      video.onloadedmetadata = () => {
        console.log("🎥 Video metadata loaded:", {
          width: video.videoWidth,
          height: video.videoHeight,
          id: producerId,
        });
      };
      video.onresize = () => {
        console.log("🎥 Video resized:", {
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };
      video.onplaying = () => {
        console.log("🎥 Video started playing:", producerId);
      };
      video.onerror = (e) => {
        console.error("🎥 Video error:", video.error, e);
      };

      console.log(
        "Created video element for producer:",
        producerId,
        "Track settings:",
        consumer.track.getSettings(),
        "Track enabled:",
        consumer.track.enabled,
        "Track muted:",
        consumer.track.muted,
      );

      this.videoElementsByProducerId.set(producerId, video);
      this.attachRemoteVideo(video);

      try {
        await this.safePlayVideo(video);
      } catch (e) {
        console.warn(`Video ${producerId} play failed:`, e);
      }
    }
  }

  private async safePlayVideo(video: HTMLVideoElement) {
    try {
      await video.play();
    } catch (error) {
      // Ignore AbortError which happens if video.pause() is called immediately after play()
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.warn(
        "safePlayVideo: Play failed (likely autoplay policy)",
        error,
      );
      throw error;
    }
  }

  private async stopConsumer(producerId: string, kind: "audio" | "video") {
    if (kind === "video") {
      await this.pauseConsumer(
        producerId,
        kind,
        this.producerOwners.get(producerId) ?? "",
      );
      return;
    }
    const consumer = this.consumersByProducerId.get(producerId);
    if (!consumer) return;

    const consumerId = consumer.id;
    this.cleanupConsumer(producerId);

    try {
      const client = getTrpcClient();
      await client.mediasoup.closeConsumer.mutate({ consumerId });
    } catch (error) {
      console.error("Failed to close consumer on server:", error);
    }
  }

  private async pauseConsumer(
    producerId: string,
    kind: "audio" | "video",
    _producerUserId: string,
  ) {
    if (kind !== "video") return;
    const consumer = this.consumersByProducerId.get(producerId);
    if (!consumer) return;

    consumer.pause();
    this.pausedProducerIds.add(producerId);

    const video = this.videoElementsByProducerId.get(producerId);
    if (video) {
      video.pause();
      video.remove();
    }

    try {
      const client = getTrpcClient();
      await client.mediasoup.pauseConsumer.mutate({ consumerId: consumer.id });
    } catch (error) {
      console.error("Failed to pause consumer on server:", error);
    }
  }

  private async resumeConsumer(
    producerId: string,
    kind: "audio" | "video",
    _producerUserId: string,
  ) {
    if (kind !== "video") return;
    const consumer = this.consumersByProducerId.get(producerId);
    if (!consumer) return;

    consumer.resume();
    this.pausedProducerIds.delete(producerId);

    const video = this.videoElementsByProducerId.get(producerId);
    if (video) {
      this.attachRemoteVideo(video);
      video.play().catch(() => {});
    }

    try {
      const client = getTrpcClient();
      await client.mediasoup.resumeConsumer.mutate({ consumerId: consumer.id });
    } catch (error) {
      console.error("Failed to resume consumer on server:", error);
    }
  }

  private cleanupConsumer(producerId: string) {
    const consumer = this.consumersByProducerId.get(producerId);
    if (consumer) {
      consumer.close();
      this.consumersByProducerId.delete(producerId);
    }

    const audio = this.audioElementsByProducerId.get(producerId);
    if (audio) {
      audio.srcObject = null;
      this.audioElementsByProducerId.delete(producerId);
    }

    const video = this.videoElementsByProducerId.get(producerId);
    if (video) {
      video.srcObject = null;
      video.remove();
      this.videoElementsByProducerId.delete(producerId);
    }

    this.pausedProducerIds.delete(producerId);
    this.producerOwners.delete(producerId);
  }

  private attachRemoteVideo(video: HTMLVideoElement) {
    if (
      this.remoteVideoContainer &&
      !this.remoteVideoContainer.contains(video)
    ) {
      this.remoteVideoContainer.appendChild(video);
    }
  }

  private attachLocalPreview(stream: MediaStream) {
    if (!this.localVideoElement) {
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      video.className =
        "h-full w-full rounded-xl border-2 border-white/10 bg-zinc-900/90 object-cover shadow-2xl transition-all hover:border-white/20";
      this.localVideoElement = video;
    }

    if (
      this.localVideoContainer &&
      this.localVideoElement &&
      !this.localVideoContainer.contains(this.localVideoElement)
    ) {
      this.localVideoContainer.appendChild(this.localVideoElement);
    }
  }

  // Make prompt handler public for Network.ts
  async handleMeetingPrompt(action: {
    requestId?: string;
    meetingId?: string;
    expiresAt?: number;
    peerId: string;
  }) {
    if (!action.requestId || !action.meetingId) return;

    const peerId = action.peerId;
    const currentState = this.peerStates.get(peerId);

    // Idempotency: Ignore if already active/connecting in THIS meeting
    if (currentState) {
      if (
        currentState.meetingId === action.meetingId &&
        currentState.status === "ACTIVE"
      )
        return;
      if (currentState.status === "ACTIVE") return; // Already in another meeting?
    }

    // Update state to PROMPTED
    this.peerStates.set(peerId, {
      status: "PROMPTED",
      meetingId: action.meetingId,
    });

    if (!this.toastEnabled) {
      this.pendingMeetingPrompts.set(action.requestId, {
        ...action,
        type: "meetingPrompt",
      });
      return;
    }

    if (this.meetingPrompts.has(action.requestId)) return;

    const now = Date.now();
    const expiresAt = action.expiresAt ?? now + 15000;
    const duration = Math.max(0, expiresAt - now);

    const respond = (accept: boolean) => {
      const prompt = this.meetingPrompts.get(action.requestId!);
      if (prompt) {
        clearTimeout(prompt.timeoutId);
        toast.dismiss(prompt.toastId);
        this.meetingPrompts.delete(action.requestId!);
      }
      this.network.sendMeetingResponse(
        action.requestId!,
        accept,
        action.peerId,
      );
    };

    const toastId = toast("Wanna hold a meeting?", {
      duration,
      action: {
        label: "Sure!",
        onClick: () => {
          this.enableCamera();
          respond(true);
        },
      },
      cancel: {
        label: "Maybe later",
        onClick: () => respond(false),
      },
    });

    const timeoutId = window.setTimeout(() => respond(false), duration);
    this.meetingPrompts.set(action.requestId, { toastId, timeoutId });
  }

  // Make meeting start handler public for Network.ts
  async handleMeetingStart(action: { peerId: string; meetingId?: string }) {
    console.log("🎬 Meeting START with:", action.peerId);

    const peerId = action.peerId;
    const meetingId = action.meetingId;
    const currentState = this.peerStates.get(peerId);

    // Strict state check?
    // If we have a state, ensure meetingId matches (if provided)
    if (currentState && meetingId && currentState.meetingId !== meetingId) {
      console.warn(
        `Ignoring MeetingStart for ${peerId}: ID mismatch (${currentState.meetingId} vs ${meetingId})`,
      );
      return;
    }

    // Transition to ACTIVE
    this.peerStates.set(peerId, {
      status: "ACTIVE",
      meetingId: meetingId || currentState?.meetingId,
    });

    await this.enableCamera();
    await this.fetchAndConsumePeer(action.peerId);

    console.log("✨ Emitting NAVIGATE_TO_SITTING_AREA via Phaser Events");
    phaserEvents.emit(Event.NAVIGATE_TO_SITTING_AREA);
  }

  // Make meeting end handler public for Network.ts
  async handleMeetingEnd(action: {
    peerId: string;
    meetingId?: string;
    reason?: string;
  }) {
    console.log("🎬 Meeting END with:", action.peerId);

    const peerId = action.peerId;
    const meetingId = action.meetingId;
    const currentState = this.peerStates.get(peerId);

    // Idempotency: Ignore if we are not in a meeting with this ID
    if (meetingId && currentState && currentState.meetingId !== meetingId) {
      console.warn(
        `Ignoring MeetingEnd for ${peerId}: ID mismatch (${currentState.meetingId} vs ${meetingId})`,
      );
      return;
    }

    this.peerStates.delete(peerId);

    // Stop consumers for this peer
    await this.stopPeerMedia(action.peerId);

    // Notify Game scene to return player to original position
    phaserEvents.emit(Event.MEETING_ENDED);
  }

  // Make proximity update handler public for Network.ts
  async handleProximityUpdate(action: {
    type: "enter" | "leave";
    media: "audio" | "video";
    peerId: string;
  }) {
    console.log("📡 Proximity Update:", action);
    if (action.media === "audio") {
      if (action.type === "enter") {
        await this.fetchAndConsumePeer(action.peerId, "audio");
      } else {
        await this.stopPeerMedia(action.peerId, "audio");
      }
    }
  }

  // Make peer left handler public for Network.ts
  handlePeerLeft(peerId: string) {
    this.peerStates.delete(peerId);
    void this.stopPeerMedia(peerId);
  }

  private async fetchAndConsumePeer(
    peerId: string,
    kindChanged?: "audio" | "video",
  ) {
    try {
      const client = getTrpcClient();
      const producers = await client.mediasoup.getPeerProducers.query({
        peerId,
      });

      for (const p of producers) {
        if (kindChanged && p.kind !== kindChanged) continue;
        await this.consumeProducer(p.producerId, p.kind, peerId);
      }
    } catch (e) {
      console.error("Failed to fetch peer producers:", e);
    }
  }

  private async stopPeerMedia(peerId: string, kind?: "audio" | "video") {
    const toStop: { id: string; kind: "audio" | "video" }[] = [];
    for (const [producerId, owner] of this.producerOwners) {
      if (owner === peerId) {
        const consumer = this.consumersByProducerId.get(producerId);
        if (consumer && (!kind || consumer.kind === kind)) {
          toStop.push({ id: producerId, kind: consumer.kind });
        }
      }
    }
    for (const item of toStop) {
      await this.stopConsumer(item.id, item.kind);
    }
  }

  reset() {
    this.peerStates.clear();
    this.activeMeetingPeers.clear();
    this.pendingMeetingPrompts.clear();

    this.meetingPrompts.forEach((p) => {
      clearTimeout(p.timeoutId);
      toast.dismiss(p.toastId);
    });
    this.meetingPrompts.clear();

    // Close all consumers and clear maps
    this.consumersByProducerId.forEach((c) => c.close());
    this.consumersByProducerId.clear();

    this.audioElementsByProducerId.forEach((el) => (el.srcObject = null));
    this.audioElementsByProducerId.clear();

    this.videoElementsByProducerId.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
    this.videoElementsByProducerId.clear();

    this.pausedProducerIds.clear();
    this.producerOwners.clear();
  }

  getActiveMeetingPeers() {
    // Return peers that are in ACTIVE state
    const active: string[] = [];
    for (const [peerId, state] of this.peerStates) {
      if (state.status === "ACTIVE") active.push(peerId);
    }
    return active;
  }
}
