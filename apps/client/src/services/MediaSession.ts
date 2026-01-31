import { Device, types } from "mediasoup-client";
import { toast } from "sonner";
import { getTrpcClient } from "../../app/lib/trpc";
import { phaserEvents, Event } from "../events/EventCenter";

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
      expiresAt?: number;
    }
  | {
      type: "meetingStart";
      peerId: string;
    }
  | {
      type: "meetingEnd";
      peerId: string;
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
  private polling = false;
  private pollTimer?: number;
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
      expiresAt?: number;
    }
  >();
  private meetingPrompts = new Map<
    string,
    { toastId: string | number; timeoutId: number }
  >();
  private activeMeetingPeers = new Set<string>();

  async start() {
    if (this.started) return;
    this.started = true;

    // Start polling immediately so meeting prompts can appear even
    // if media device initialization fails.
    this.startPolling();

    try {
      await this.initializeDeviceAndTransports();
      await this.flushPendingActions();

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

    // Similar to a direct WebRTC flow (getUserMedia + attach track),
    // but mediasoup handles the SFU transport instead of P2P calls.
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
    if (this.remoteVideoContainer !== remoteContainer) {
      console.log(
        "MediaSession.setVideoContainers: Update remote container",
        remoteContainer ? "Found" : "Null",
      );
    }
    this.remoteVideoContainer = remoteContainer;
    this.localVideoContainer = localContainer;

    if (this.localVideoStream && this.localVideoElement && localContainer) {
      if (!localContainer.contains(this.localVideoElement)) {
        localContainer.appendChild(this.localVideoElement);
      }
    }

    if (remoteContainer) {
      console.log(
        `Attaching ${this.videoElementsByProducerId.size} existing videos to remote container`,
      );
      for (const [id, video] of this.videoElementsByProducerId) {
        if (!remoteContainer.contains(video)) {
          console.log(`Appending video ${id} to remote container`);
          remoteContainer.appendChild(video);
          // Try playing again just in case
          video.play().catch((e) => console.warn("Autoplay retry failed:", e));
        }
      }
    }
  }

  setMeetingToastEnabled(enabled: boolean) {
    this.toastEnabled = enabled;
    if (enabled) {
      // Ensure polling runs even if media session hasn't started yet.
      this.startPolling();
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

  private startPolling() {
    if (this.polling) return;
    this.polling = true;

    const poll = async () => {
      if (!this.polling) return;
      await this.pollProximityActions();
      this.pollTimer = window.setTimeout(poll, 1000);
    };

    poll();
  }

  private async pollProximityActions() {
    const client = getTrpcClient();
    try {
      const actions = (await client.mediasoup.pollProximityActions.query()) as
        | ProximityAction[]
        | undefined;
      if (!actions || actions.length === 0) return;

      console.log("MediaSession received actions:", actions);
      await this.handleActions(actions);
    } catch (error) {
      console.error("Failed to poll proximity actions:", error);
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

    // "producerclose" is a valid mediasoup event but not in the TS types
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
      console.log("Creating video element for producer:", producerId);
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // Remote video (visual only), audio is separate
      video.srcObject = new MediaStream([consumer.track]);
      // Use aspect-video to prevent collapse if height is 0
      video.className =
        "w-full aspect-video rounded-xl border-2 border-white/10 bg-zinc-900/90 object-cover shadow-2xl transition-all hover:border-white/20 cursor-pointer";
      this.videoElementsByProducerId.set(producerId, video);
      this.attachRemoteVideo(video);
      video.play().catch((e) => {
        console.warn("Video play failed:", e);
      });
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
      video.play().catch(() => {
        // Autoplay can be blocked until user interacts with the page.
      });
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
      console.log("attachRemoteVideo: Appending video to container");
      this.remoteVideoContainer.appendChild(video);
    } else {
      console.log(
        "attachRemoteVideo: Container not ready or video already attached",
        !!this.remoteVideoContainer,
      );
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

  private async handleMeetingPrompt(action: {
    type: "meetingPrompt";
    peerId: string;
    requestId?: string;
    expiresAt?: number;
  }) {
    if (!action.requestId) return;
    if (!this.toastEnabled) {
      if (!this.pendingMeetingPrompts.has(action.requestId)) {
        this.pendingMeetingPrompts.set(action.requestId, action);
      }
      return;
    }
    if (this.meetingPrompts.has(action.requestId)) return;

    if (this.activeMeetingPeers.has(action.peerId)) {
      console.log(
        "Already in a meeting with peer, suppressing prompt:",
        action.peerId,
      );
      return;
    }

    console.log("Handling meeting prompt:", action);
    const client = getTrpcClient();
    const now = Date.now();
    const expiresAt = action.expiresAt ?? now + 5000;
    const duration = Math.max(0, expiresAt - now);

    const respond = async (accept: boolean) => {
      const prompt = this.meetingPrompts.get(action.requestId!);
      if (prompt) {
        clearTimeout(prompt.timeoutId);
        toast.dismiss(prompt.toastId);
        this.meetingPrompts.delete(action.requestId!);
      }
      try {
        await client.mediasoup.meetingRespond.mutate({
          requestId: action.requestId!,
          peerId: action.peerId,
          accept,
        });
      } catch (error) {
        console.error("Failed to respond to meeting prompt:", error);
      }
    };

    const toastId = toast("Wanna hold a meeting?", {
      duration,
      action: {
        label: "Sure!",
        onClick: async () => {
          await this.enableCamera();
          await respond(true);
        },
      },
      cancel: {
        label: "Maybe later",
        onClick: async () => {
          await respond(false);
        },
      },
    });

    const timeoutId = window.setTimeout(() => {
      respond(false).catch(() => {
        // Ignore timeout errors
      });
    }, duration);

    this.meetingPrompts.set(action.requestId, { toastId, timeoutId });
  }

  private async handleMeetingStart(action: {
    type: "meetingStart";
    peerId: string;
  }) {
    this.activeMeetingPeers.add(action.peerId);
    if (!this.cameraEnabled) {
      await this.enableCamera();
    }
    // Trigger navigation to sitting area for the meeting
    phaserEvents.emit(Event.NAVIGATE_TO_SITTING_AREA);
  }

  private async handleMeetingEnd(action: {
    type: "meetingEnd";
    peerId: string;
  }) {
    this.activeMeetingPeers.delete(action.peerId);
  }

  getActiveMeetingPeers() {
    return Array.from(this.activeMeetingPeers);
  }
}
