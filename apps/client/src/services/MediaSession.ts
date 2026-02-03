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
  private videoRecoveryTimers = new Map<string, number>();
  private videoReconsumeTimers = new Map<string, number>();
  private videoRecoveryAttempts = new Map<string, number>();
  private videoCreationTime = new Map<string, number>();
  private meetingVideoWatchdogs = new Map<string, number>();
  private videoResumeRequested = new Set<string>();
  private remoteVideoContainer: HTMLElement | null = null;
  private localVideoContainer: HTMLElement | null = null;
  private started = false;
  private gestureRetryBound = false;
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
  private selfId?: string;
  private consumingInFlight = new Set<string>();
  private peerStates = new Map<
    string,
    {
      status: "IDLE" | "PROMPTED" | "ACTIVE";
      meetingId?: string;
      localAccepted?: boolean;
    }
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
    console.log("🎥 Send Transport Options:", {
      id: sendTransportInfo.id,
      iceCandidates: sendTransportInfo.iceCandidates,
      dtlsParameters: sendTransportInfo.dtlsParameters,
    });
    this.sendTransport = this.device.createSendTransport(
      sendTransportInfo as types.TransportOptions,
    );
    this.bindTransportEvents(this.sendTransport);

    const recvTransportInfo = await client.mediasoup.createTransport.mutate({
      direction: "recv",
    });
    console.log("🎥 Recv Transport Options:", {
      id: recvTransportInfo.id,
      iceCandidates: recvTransportInfo.iceCandidates,
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
        console.log(`QT Transport ${transport.direction} connecting...`);
        await client.mediasoup.connectTransport.mutate({
          transportId: transport.id,
          dtlsParameters,
        });
        console.log(`QT Transport ${transport.direction} connected to server.`);
        callback();
      } catch (error) {
        console.error(
          `QT Transport ${transport.direction} connect failed:`,
          error,
        );
        errback(error as Error);
      }
    });

    transport.on("connectionstatechange", (state) => {
      console.log(
        `QT Transport ${transport.direction} connection state changed: ${state}`,
      );
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
    if (remoteContainer) {
      this.remoteVideoContainer = remoteContainer;
    } else if (!this.remoteVideoContainer) {
      this.remoteVideoContainer = null;
    }
    this.localVideoContainer = localContainer;

    if (this.localVideoStream && this.localVideoElement && localContainer) {
      if (!localContainer.contains(this.localVideoElement)) {
        localContainer.appendChild(this.localVideoElement);
      }
    }

    this.syncRemoteVideos();
  }

  private getSelfId() {
    const id = this.network.getMySessionId();
    if (id) this.selfId = id;
    return id ?? this.selfId;
  }

  // Idempotent sync function to ensure all ready videos are in the container
  private syncRemoteVideos() {
    if (!this.remoteVideoContainer) {
      console.log("🎥 syncRemoteVideos: No container available.");
      return;
    }

    console.log(
      `🎥 syncRemoteVideos: Syncing ${this.videoElementsByProducerId.size} videos...`,
    );

    let activeCount = 0;
    for (const [producerId, video] of this.videoElementsByProducerId) {
      if (this.pausedProducerIds.has(producerId)) continue;
      activeCount++;

      // Ensure attached
      if (!this.remoteVideoContainer.contains(video)) {
        console.log(
          `🎥 syncRemoteVideos: Attaching video ${producerId} to container`,
        );
        this.remoteVideoContainer.appendChild(video);
      }

      // Debug: Log video state
      console.log(`🎥 syncRemoteVideos: Video ${producerId} state:`, {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
        srcObject: !!video.srcObject,
        isConnected: video.isConnected,
        offsetWidth: video.offsetWidth,
        offsetHeight: video.offsetHeight,
      });

      // Force play on sync (in case it was paused)
      video
        .play()
        .catch((e) =>
          console.warn(`Video ${producerId} play failed on sync:`, e),
        );
    }

    console.log(
      `🎥 syncRemoteVideos: Completed. Active videos: ${activeCount}. Container children count: ${this.remoteVideoContainer.childElementCount}`,
    );
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
          await this.resumeConsumer(action.producerId, action.kind);
          break;
        case "pause":
          if (!canHandleMedia) {
            this.pendingActions.push(action);
            break;
          }
          await this.pauseConsumer(action.producerId, action.kind);
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
      await this.resumeConsumer(producerId, kind);
      return;
    }

    if (this.consumingInFlight.has(producerId)) {
      console.log(
        `🎥 consumeProducer: Already in-flight for ${producerId}, skipping duplicate.`,
      );
      return;
    }
    this.consumingInFlight.add(producerId);
    try {
      if (
        kind === "video" &&
        this.videoElementsByProducerId.size >= this.maxVideoConsumers
      ) {
        console.warn(
          "Video consumer limit reached, skipping producer",
          producerId,
        );
        this.consumingInFlight.delete(producerId);
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

      // Log recv transport state before consuming
      console.log(`🎥 RecvTransport state before consume:`, {
        id: this.recvTransport.id,
        connectionState: this.recvTransport.connectionState,
        closed: this.recvTransport.closed,
      });

      console.log(
        `🎥 consumeProducer: Requesting consume for ${producerId} on transport ${this.recvTransport.id}`,
      );
      const client = getTrpcClient();
      const consumerInfo = await client.mediasoup.consume.mutate({
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      });

      console.log(
        `🎥 consumeProducer: Received consumer info from server:`,
        consumerInfo,
      );

      const consumer = await this.recvTransport.consume({
        id: consumerInfo.id,
        producerId: consumerInfo.producerId,
        kind: consumerInfo.kind,
        rtpParameters: consumerInfo.rtpParameters as types.RtpParameters,
      });

      console.log(
        `🎥 consumeProducer: Consumer created locally. Kind: ${consumer.kind}, Track State:`,
        {
          enabled: consumer.track.enabled,
          muted: consumer.track.muted,
          readyState: consumer.track.readyState,
          id: consumer.track.id,
        },
      );

      this.consumersByProducerId.set(producerId, consumer);
      this.producerOwners.set(producerId, producerUserId);

      consumer.on("transportclose", () => {
        this.cleanupConsumer(producerId);
      });

      (
        consumer as unknown as { on: (event: string, cb: () => void) => void }
      ).on("producerclose", () => {
        this.cleanupConsumer(producerId);
      });

      // CRITICAL: Ensure consumer is resumed on both client + server side
      // Mediasoup consumers are created paused by default - must resume for packets to flow
      try {
        consumer.resume();
      } catch {}

      // For video, we MUST await the server resume before requesting keyframe
      // Otherwise the keyframe is requested while consumer is still paused
      if (consumer.kind === "video") {
        try {
          await client.mediasoup.resumeConsumer.mutate({
            consumerId: consumer.id,
          });
          console.log(`🎥 Consumer ${consumer.id} (video) resumed on server`);
          // Now request keyframe after server has resumed
          await this.requestKeyFrame(consumer.id);
          console.log(`🎥 Keyframe requested for ${consumer.id}`);
        } catch (error) {
          console.warn("Failed to resume/keyframe video consumer:", error);
        }
      } else {
        // Audio can be fire-and-forget
        client.mediasoup.resumeConsumer
          .mutate({ consumerId: consumer.id })
          .then(() => {
            console.log(`🎥 Consumer ${consumer.id} (audio) resumed on server`);
          })
          .catch((error) => {
            console.warn("Failed to resume audio consumer:", error);
          });
      }

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
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("muted", ""); // Attribute for initial parsing
        video.setAttribute("disablePictureInPicture", "");
        video.disablePictureInPicture = true;

        video.controls = false; // Ensure controls don't appear

        // Log track state before creating MediaStream
        const track = consumer.track;
        console.log("🎥 Creating video with track:", {
          trackId: track.id,
          trackEnabled: track.enabled,
          trackMuted: track.muted,
          trackReadyState: track.readyState,
          trackContentHint: track.contentHint,
        });

        // Listen for track events - unmute indicates RTP data is flowing
        track.onunmute = () => {
          console.log("🎥 Track UNMUTED (RTP data flowing):", producerId);
        };
        track.onmute = () => {
          console.log("🎥 Track MUTED (no RTP data):", producerId);
        };
        track.onended = () => {
          console.log("🎥 Track ENDED:", producerId);
        };

        video.srcObject = new MediaStream([track]);
        // Ensure the video has a concrete height so it is visible even if the Tailwind aspect-ratio plugin isn't enabled
        video.className =
          "w-full h-36 sm:h-40 rounded-xl border-2 border-white/10 bg-zinc-900/90 object-cover shadow-2xl transition-all hover:border-white/20 cursor-pointer block";
        video.id = producerId;

        // Video debugging
        video.onloadedmetadata = () => {
          console.log("🎥 Video metadata loaded:", {
            width: video.videoWidth,
            height: video.videoHeight,
            id: producerId,
          });
          const timeoutId = this.videoRecoveryTimers.get(producerId);
          if (timeoutId) window.clearTimeout(timeoutId);
          const reconsumeId = this.videoReconsumeTimers.get(producerId);
          if (reconsumeId) window.clearTimeout(reconsumeId);
          this.ensureRemoteVideoFlow(video, consumer.id);
        };
        video.oncanplay = () => {
          const timeoutId = this.videoRecoveryTimers.get(producerId);
          if (timeoutId) window.clearTimeout(timeoutId);
          const reconsumeId = this.videoReconsumeTimers.get(producerId);
          if (reconsumeId) window.clearTimeout(reconsumeId);
          this.ensureRemoteVideoFlow(video, consumer.id);
        };
        video.onresize = () => {
          console.log("🎥 Video resized:", {
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };
        video.onplaying = () => {
          console.log("🎥 Video started playing:", producerId);
          const timeoutId = this.videoRecoveryTimers.get(producerId);
          if (timeoutId) window.clearTimeout(timeoutId);
          const reconsumeId = this.videoReconsumeTimers.get(producerId);
          if (reconsumeId) window.clearTimeout(reconsumeId);
        };
        video.onwaiting = () => {
          console.log("🎥 Video waiting for data:", producerId);
          this.scheduleVideoRecovery(producerId, consumer, video);
        };
        video.onstalled = () => {
          console.warn("🎥 Video stalled:", producerId);
          this.scheduleVideoRecovery(producerId, consumer, video);
        };
        video.onpause = () => {
          console.log("🎥 Video paused:", producerId);
        };
        video.onplay = () => {
          console.log("🎥 Video play event:", producerId);
        };
        video.onerror = (e) => {
          console.error("🎥 Video error:", video.error, e);
        };
        consumer.track.onunmute = () => {
          const timeoutId = this.videoRecoveryTimers.get(producerId);
          if (timeoutId) window.clearTimeout(timeoutId);
          this.ensureRemoteVideoFlow(video, consumer.id);
        };
        consumer.track.onmute = () => {
          this.scheduleVideoRecovery(producerId, consumer, video);
        };
        consumer.track.onended = () => {
          console.warn("🎥 Consumer track ended:", producerId);
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

        const prev = this.videoElementsByProducerId.get(producerId);
        if (prev && prev !== video) {
          try {
            prev.srcObject = null;
          } catch {}
          prev.remove();
        }
        this.videoElementsByProducerId.set(producerId, video);
        this.videoCreationTime.set(producerId, Date.now()); // Track creation time for grace period
        this.attachRemoteVideo();
        this.ensureRemoteVideoFlow(video, consumer.id);
        this.bindUserGestureRetry();
        this.scheduleVideoRecovery(producerId, consumer, video);

        // DEBUG: Monitor video flow
        let lastStats: {
          bytesReceived?: number;
          packetsReceived?: number;
          framesDecoded?: number;
          timestamp?: number;
        } = {};
        const statsInterval = setInterval(async () => {
          if (consumer.closed) {
            clearInterval(statsInterval);
            return;
          }
          try {
            const stats = await consumer.getStats();
            stats.forEach((report) => {
              if (report.type === "inbound-rtp" && report.kind === "video") {
                const now = report.timestamp ?? performance.now();
                const elapsedMs =
                  lastStats.timestamp !== undefined
                    ? now - lastStats.timestamp
                    : undefined;
                const bytesDelta =
                  lastStats.bytesReceived !== undefined
                    ? report.bytesReceived - lastStats.bytesReceived
                    : undefined;
                const framesDelta =
                  lastStats.framesDecoded !== undefined &&
                  report.framesDecoded !== undefined
                    ? report.framesDecoded - lastStats.framesDecoded
                    : undefined;
                const kbps =
                  elapsedMs && bytesDelta !== undefined
                    ? Math.round((bytesDelta * 8) / elapsedMs)
                    : undefined;
                const fps =
                  elapsedMs && framesDelta !== undefined
                    ? Math.round((framesDelta * 1000) / elapsedMs)
                    : undefined;

                console.log(`📊 Video Stats (${producerId}):`, {
                  bytesReceived: report.bytesReceived,
                  packetsReceived: report.packetsReceived,
                  framesDecoded: report.framesDecoded,
                  frameWidth: report.frameWidth,
                  frameHeight: report.frameHeight,
                  kbps,
                  fps,
                  videoReadyState: video.readyState,
                  videoPaused: video.paused,
                  trackEnabled: consumer.track.enabled,
                  trackMuted: consumer.track.muted,
                  trackReadyState: consumer.track.readyState,
                });

                lastStats = {
                  bytesReceived: report.bytesReceived,
                  packetsReceived: report.packetsReceived,
                  framesDecoded: report.framesDecoded,
                  timestamp: now,
                };
              }
            });
          } catch (e) {
            console.error("Stats error:", e);
          }
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to consume producer:", error);
    } finally {
      this.consumingInFlight.delete(producerId);
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

  private requestKeyFrame(consumerId: string) {
    const client = getTrpcClient();
    return client.mediasoup.requestKeyFrame.mutate({ consumerId });
  }

  private ensureRemoteVideoFlow(video: HTMLVideoElement, consumerId: string) {
    const attempt = async () => {
      const hasData = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      const isPlaying = hasData && !video.paused && !video.ended;
      if (isPlaying) return;
      try {
        await this.safePlayVideo(video);
      } catch {}
      this.requestKeyFrame(consumerId).catch((error) => {
        console.warn("Failed to request keyframe:", error);
      });
    };

    void attempt();
    setTimeout(() => void attempt(), 500);
    setTimeout(() => void attempt(), 1500);
  }

  private scheduleVideoRecovery(
    producerId: string,
    consumer: types.Consumer,
    video: HTMLVideoElement,
  ) {
    if (typeof window === "undefined") return;

    // Skip recovery if already consuming this producer (prevents feedback loop)
    if (this.consumingInFlight.has(producerId)) {
      console.log(
        `🎥 scheduleVideoRecovery: Skipping ${producerId} - already consuming`,
      );
      return;
    }

    // Check if video already has frames - no recovery needed
    const hasFrames =
      video.videoWidth > 0 &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (hasFrames) {
      // Clear any existing timers and return
      const existing = this.videoRecoveryTimers.get(producerId);
      if (existing) window.clearTimeout(existing);
      const existingReconsume = this.videoReconsumeTimers.get(producerId);
      if (existingReconsume) window.clearTimeout(existingReconsume);
      return;
    }

    // Grace period: don't trigger aggressive recovery within 10s of video creation
    const creationTime = this.videoCreationTime.get(producerId);
    const now = Date.now();
    const gracePeriodMs = 10000; // 10 seconds grace period for initial keyframe
    const isInGracePeriod = creationTime && now - creationTime < gracePeriodMs;

    const existing = this.videoRecoveryTimers.get(producerId);
    if (existing) window.clearTimeout(existing);
    const existingReconsume = this.videoReconsumeTimers.get(producerId);
    if (existingReconsume) window.clearTimeout(existingReconsume);

    // Stall recovery timer: request keyframe and try resume (5s instead of 2s)
    const timeoutId = window.setTimeout(() => {
      if (consumer.closed) return;
      const hasFramesNow =
        video.videoWidth > 0 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (hasFramesNow) return;
      console.warn("🎥 Video stalled. Forcing resume + keyframe:", producerId);
      try {
        consumer.resume();
      } catch {}
      const client = getTrpcClient();
      client.mediasoup.resumeConsumer
        .mutate({ consumerId: consumer.id })
        .catch((error) => {
          console.warn("Failed to resume consumer during recovery:", error);
        });
      this.ensureRemoteVideoFlow(video, consumer.id);
    }, 5000); // 5 seconds instead of 2

    this.videoRecoveryTimers.set(producerId, timeoutId);

    // Re-consume timer: Only schedule if NOT in grace period (15s instead of 6s)
    if (!isInGracePeriod) {
      const reconsumeId = window.setTimeout(async () => {
        if (consumer.closed) return;
        if (this.pausedProducerIds.has(producerId)) return;
        if (this.consumingInFlight.has(producerId)) return;
        const hasFramesNow =
          video.videoWidth > 0 &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        if (hasFramesNow) return;

        const attempts = (this.videoRecoveryAttempts.get(producerId) ?? 0) + 1;
        if (attempts > 2) return;
        this.videoRecoveryAttempts.set(producerId, attempts);

        const ownerId = this.producerOwners.get(producerId);
        if (!ownerId) return;

        console.warn("🎥 Re-consuming video after stall:", {
          producerId,
          attempts,
        });

        const client = getTrpcClient();
        try {
          await client.mediasoup.closeConsumer.mutate({
            consumerId: consumer.id,
          });
        } catch (error) {
          console.warn("Failed to close consumer during recovery:", error);
        }
        this.cleanupConsumer(producerId);
        await this.consumeProducer(producerId, "video", ownerId);
      }, 15000); // 15 seconds instead of 6

      this.videoReconsumeTimers.set(producerId, reconsumeId);
    } else {
      console.log(
        `🎥 scheduleVideoRecovery: In grace period for ${producerId}, skipping re-consume timer`,
      );
    }
  }

  private bindUserGestureRetry() {
    if (this.gestureRetryBound || typeof window === "undefined") return;
    this.gestureRetryBound = true;

    const retry = () => {
      for (const [producerId, video] of this.videoElementsByProducerId) {
        const consumer = this.consumersByProducerId.get(producerId);
        if (!consumer) continue;
        if (
          video.paused ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          void this.safePlayVideo(video);
          this.requestKeyFrame(consumer.id).catch((error) => {
            console.warn("Failed to request keyframe:", error);
          });
        }
      }
      const stillBlocked = Array.from(
        this.videoElementsByProducerId.values(),
      ).some(
        (video) =>
          video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA,
      );
      if (stillBlocked) {
        this.gestureRetryBound = false;
        setTimeout(() => this.bindUserGestureRetry(), 250);
      }
    };
    const clearHandler = () => {
      window.removeEventListener("keydown", handleKeydown);
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "t" && event.key !== "T") return;
      clearHandler();
      retry();
    };

    window.addEventListener(
      "pointerdown",
      () => {
        clearHandler();
        retry();
      },
      { once: true },
    );
    window.addEventListener("keydown", handleKeydown);
  }

  private async stopConsumer(producerId: string, kind: "audio" | "video") {
    if (kind === "video") {
      await this.pauseConsumer(producerId, kind);
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

  private async pauseConsumer(producerId: string, kind: "audio" | "video") {
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

  private async resumeConsumer(producerId: string, kind: "audio" | "video") {
    if (kind !== "video") return;
    const consumer = this.consumersByProducerId.get(producerId);
    if (!consumer) return;

    consumer.resume();
    this.pausedProducerIds.delete(producerId);

    const video = this.videoElementsByProducerId.get(producerId);
    if (video) {
      this.attachRemoteVideo();
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
    const timeoutId = this.videoRecoveryTimers.get(producerId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      this.videoRecoveryTimers.delete(producerId);
    }
    const reconsumeId = this.videoReconsumeTimers.get(producerId);
    if (reconsumeId) {
      window.clearTimeout(reconsumeId);
      this.videoReconsumeTimers.delete(producerId);
    }
    this.videoRecoveryAttempts.delete(producerId);
    this.videoCreationTime.delete(producerId); // Clean up creation time tracking
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

  private attachRemoteVideo() {
    // Just trigger the master sync logic
    this.syncRemoteVideos();
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
      localAccepted: currentState?.localAccepted ?? false,
    });

    const markLocalAcceptance = () => {
      const state = this.peerStates.get(peerId);
      if (!state || state.localAccepted) return;
      this.peerStates.set(peerId, { ...state, localAccepted: true });
      phaserEvents.emit(Event.MEETING_ACCEPTED, peerId);
      // Proactively ensure we start consuming the remote's video in case
      // the server-side 'meeting-start' arrives late or is dropped for this client.
      void this.ensureRemoteVideoForPeer(peerId);
    };

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
      if (accept) {
        markLocalAcceptance();
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

  private hasVideoForPeer(peerId: string) {
    for (const [producerId, owner] of this.producerOwners) {
      if (owner === peerId) {
        const consumer = this.consumersByProducerId.get(producerId);
        if (
          consumer &&
          consumer.kind === "video" &&
          !this.pausedProducerIds.has(producerId)
        )
          return true;
      }
    }
    return false;
  }

  private async ensureRemoteVideoForPeer(peerId: string) {
    if (this.hasVideoForPeer(peerId)) return;
    try {
      await this.fetchAndConsumePeer(peerId, "video");
    } catch (e) {
      console.warn("ensureRemoteVideoForPeer: initial fetch failed", e);
    }
    // Light retry once after a short delay in case remote camera just enabled
    setTimeout(async () => {
      if (!this.hasVideoForPeer(peerId)) {
        try {
          await this.fetchAndConsumePeer(peerId, "video");
        } catch (e) {
          console.warn("ensureRemoteVideoForPeer: retry fetch failed", e);
        }
      }
    }, 1200);
  }

  private startMeetingVideoWatchdog(peerId: string) {
    if (typeof window === "undefined") return;
    const existing = this.meetingVideoWatchdogs.get(peerId);
    if (existing) window.clearInterval(existing);

    let attempts = 0;
    const intervalId = window.setInterval(async () => {
      const state = this.peerStates.get(peerId);
      if (!state || state.status !== "ACTIVE") {
        window.clearInterval(intervalId);
        this.meetingVideoWatchdogs.delete(peerId);
        return;
      }

      let hasLiveFrames = false;
      for (const [producerId, owner] of this.producerOwners) {
        if (owner !== peerId) continue;
        const consumer = this.consumersByProducerId.get(producerId);
        if (!consumer || consumer.kind !== "video") continue;
        const video = this.videoElementsByProducerId.get(producerId);
        if (
          video &&
          video.videoWidth > 0 &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          hasLiveFrames = true;
          break;
        }
      }

      if (hasLiveFrames) {
        window.clearInterval(intervalId);
        this.meetingVideoWatchdogs.delete(peerId);
        return;
      }

      attempts += 1;
      if (attempts > 3) {
        // Reduced from 6 to 3 attempts
        window.clearInterval(intervalId);
        this.meetingVideoWatchdogs.delete(peerId);
        return;
      }

      await this.fetchAndConsumePeer(peerId, "video");
    }, 5000); // Increased from 2500ms to 5000ms

    this.meetingVideoWatchdogs.set(peerId, intervalId);
  }

  // Make meeting start handler public for Network.ts
  async handleMeetingStart(action: { peerId: string; meetingId?: string }) {
    console.log("🎬 Meeting START with:", action.peerId);

    const peerId = action.peerId;
    const meetingId = action.meetingId;
    const currentState = this.peerStates.get(peerId);
    const selfId = this.getSelfId();

    // Strict state check?
    // If we have a state, ensure meetingId matches (if provided)
    if (currentState && meetingId && currentState.meetingId !== meetingId) {
      console.warn(
        `Ignoring MeetingStart for ${peerId}: ID mismatch (${currentState.meetingId} vs ${meetingId})`,
      );
      return;
    }

    await this.enableCamera();

    // Explicitly fetch ALL media (audio + video) when meeting starts
    console.log(
      `🎥 handleMeetingStart: Fetching ALL media for peer ${action.peerId}`,
    );
    try {
      await this.fetchAndConsumePeer(action.peerId); // No kind filter = all
    } catch (err) {
      console.error("Error fetching peer media during meeting start:", err);
    }

    // Delay setting ACTIVE until media is assumed ready (or failed).
    // This ensures ArenaPage renders the container AFTER we have populated videoElementsByProducerId.
    this.peerStates.set(peerId, {
      status: "ACTIVE",
      meetingId: meetingId || currentState?.meetingId,
      localAccepted: currentState?.localAccepted ?? true,
    });

    if (selfId) {
      const selfState = this.peerStates.get(selfId);
      this.peerStates.set(selfId, {
        status: "ACTIVE",
        meetingId: meetingId || selfState?.meetingId,
        localAccepted: true,
      });
    }
    console.log(
      `🎥 handleMeetingStart: Peer ${peerId} set to ACTIVE. UI should now render container.`,
    );
    // Note: ensureRemoteVideoForPeer removed since fetchAndConsumePeer above already fetches video
    // The watchdog below provides fallback retry if video doesn't arrive
    this.startMeetingVideoWatchdog(peerId);

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
    const selfId = this.getSelfId();

    // Idempotency: Ignore if we are not in a meeting with this ID
    if (meetingId && currentState && currentState.meetingId !== meetingId) {
      console.warn(
        `Ignoring MeetingEnd for ${peerId}: ID mismatch (${currentState.meetingId} vs ${meetingId})`,
      );
      return;
    }

    this.peerStates.delete(peerId);
    const watchdog = this.meetingVideoWatchdogs.get(peerId);
    if (watchdog && typeof window !== "undefined") {
      window.clearInterval(watchdog);
      this.meetingVideoWatchdogs.delete(peerId);
    }

    if (selfId) {
      const selfState = this.peerStates.get(selfId);
      if (!meetingId || !selfState || selfState.meetingId === meetingId) {
        this.peerStates.delete(selfId);
      }
    }

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

    // Proximity strictly handles AUDIO.
    // Video is handled by MeetingStart/Stop events.
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
    const watchdog = this.meetingVideoWatchdogs.get(peerId);
    if (watchdog && typeof window !== "undefined") {
      window.clearInterval(watchdog);
      this.meetingVideoWatchdogs.delete(peerId);
    }
    void this.stopPeerMedia(peerId);
  }

  private async fetchAndConsumePeer(
    peerId: string,
    kindChanged?: "audio" | "video",
  ) {
    try {
      console.log(
        `🎥 Fetching producers for peer: ${peerId}, kind filter: ${kindChanged || "all"}`,
      );
      const client = getTrpcClient();
      const producers = await client.mediasoup.getPeerProducers.query({
        peerId,
      });

      console.log(
        `🎥 Found ${producers.length} producers for peer ${peerId}:`,
        producers,
      );

      for (const p of producers) {
        if (kindChanged && p.kind !== kindChanged) {
          console.log(
            `🎥 Skipping producer ${p.producerId} (kind ${p.kind}) due to filter ${kindChanged}`,
          );
          continue;
        }

        // Check if we already have a consumer for this producer
        const existingConsumer = this.consumersByProducerId.get(p.producerId);
        if (existingConsumer && !existingConsumer.closed) {
          // Already have a consumer - just request a keyframe for video instead of re-consuming
          if (p.kind === "video") {
            console.log(
              `🎥 Already consuming producer ${p.producerId}, requesting keyframe instead`,
            );
            this.requestKeyFrame(existingConsumer.id).catch((error) => {
              console.warn(
                "Failed to request keyframe for existing consumer:",
                error,
              );
            });
          } else {
            console.log(
              `🎥 Already consuming producer ${p.producerId} (audio), skipping`,
            );
          }
          continue;
        }

        // Check if currently in-flight
        if (this.consumingInFlight.has(p.producerId)) {
          console.log(
            `🎥 Producer ${p.producerId} already in-flight, skipping`,
          );
          continue;
        }

        console.log(
          `🎥 Consuming matched producer: ${p.producerId}, kind: ${p.kind}`,
        );
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
    this.selfId = undefined;
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
    if (typeof window !== "undefined") {
      this.videoRecoveryTimers.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      this.videoReconsumeTimers.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      this.meetingVideoWatchdogs.forEach((intervalId) =>
        window.clearInterval(intervalId),
      );
    }
    this.videoRecoveryTimers.clear();
    this.videoReconsumeTimers.clear();
    this.videoRecoveryAttempts.clear();
    this.meetingVideoWatchdogs.clear();
  }

  getActiveMeetingPeers() {
    // Return peers that are in ACTIVE state OR have an active video consumer
    // Additionally, if the local user has accepted a prompt (localAccepted),
    // consider that as an active meeting until server meeting-start arrives.
    const activeSet = new Set<string>();
    for (const [peerId, state] of this.peerStates) {
      if (state.status === "ACTIVE" || state.localAccepted)
        activeSet.add(peerId);
    }

    // Fall back to currently consumed video owners if state hasn't propagated yet
    for (const [producerId, video] of this.videoElementsByProducerId) {
      if (!this.pausedProducerIds.has(producerId) && video.isConnected) {
        const owner = this.producerOwners.get(producerId);
        if (owner) activeSet.add(owner);
      }
    }

    return Array.from(activeSet);
  }

  getRemoteVideoCount() {
    let count = 0;
    for (const [producerId, video] of this.videoElementsByProducerId) {
      if (this.pausedProducerIds.has(producerId)) continue;
      if (!video.isConnected) continue;
      count++;
    }
    return count;
  }
}
