import { TRPCError } from "@trpc/server";
import mediasoup from "mediasoup";
import {
  WORLD_SERVER_SECRET,
  MEDIASOUP_LISTEN_IP,
  MEDIASOUP_ANNOUNCED_IP,
  RUNTIME,
  CF_TURN_TOKEN_ID,
  CF_TURN_API_TOKEN,
} from "@repo/config";
import {
  closeConsumerInputSchema,
  closeConsumerOutputSchema,
  closeProducerInputSchema,
  closeProducerOutputSchema,
  connectTransportInputSchema,
  connectTransportOutputSchema,
  consumeInputSchema,
  consumeOutputSchema,
  createDeviceOutputSchema,
  createTransportInputSchema,
  meetingEndInputSchema,
  meetingEndOutputSchema,
  meetingRespondInputSchema,
  meetingRespondOutputSchema,
  pauseConsumerInputSchema,
  pauseConsumerOutputSchema,
  proximityActionListSchema,
  proximityUpdateInputSchema,
  produceInputSchema,
  produceOutputSchema,
  resumeConsumerInputSchema,
  resumeConsumerOutputSchema,
  requestKeyFrameInputSchema,
  requestKeyFrameOutputSchema,
  transportParamsSchema,
} from "@repo/validators";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

type Worker = Awaited<ReturnType<typeof mediasoup.createWorker>>;
type Router = Awaited<ReturnType<Worker["createRouter"]>>;
type WebRtcTransport = Awaited<ReturnType<Router["createWebRtcTransport"]>>;
type Producer = Awaited<ReturnType<WebRtcTransport["produce"]>>;
type Consumer = Awaited<ReturnType<WebRtcTransport["consume"]>>;
type TransportConnectParams = Parameters<WebRtcTransport["connect"]>[0];
type TransportProduceParams = Parameters<WebRtcTransport["produce"]>[0];
type TransportConsumeParams = Parameters<WebRtcTransport["consume"]>[0];
type RouterCanConsumeParams = Parameters<Router["canConsume"]>[0];
type DtlsParameters = TransportConnectParams["dtlsParameters"];
type RtpParameters = TransportProduceParams["rtpParameters"];
type AppData = TransportProduceParams["appData"];
type RtpCapabilities = RouterCanConsumeParams["rtpCapabilities"];
type ConsumerRtpCapabilities = TransportConsumeParams["rtpCapabilities"];

type PeerState = {
  transports: Map<string, WebRtcTransport>;
  sendTransportId?: string;
  recvTransportId?: string;
  audioProducers: Map<string, Producer>;
  videoProducer?: Producer;
  videoEnabled: boolean;
  consumers: Map<string, Consumer>;
  consumersByProducerId: Map<string, Consumer>;
  consumerTransportByProducerId: Map<string, string>;
};

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
      type: "meetingPrompt" | "meetingStart" | "meetingEnd";
      peerId: string;
      requestId?: string;
      expiresAt?: number;
    };

import { z } from "zod";

const peers = new Map<string, PeerState>();
const proximityQueues = new Map<string, ProximityAction[]>();
const audioProximityPeers = new Map<string, Set<string>>();
const videoProximityPeers = new Map<string, Set<string>>();
const activeMeetingsByUser = new Map<string, Set<string>>();

type MeetingState = {
  requestId: string;
  userA: string;
  userB: string;
  acceptA: boolean;
  acceptB: boolean;
  expiresAt: number;
  active: boolean;
  cooldownUntil: number;
};

const meetingStates = new Map<string, MeetingState>();
const meetingStartDebounceByKey = new Map<string, number>();
const MEETING_TIMEOUT_MS = 15000;
const MEETING_COOLDOWN_MS = 10000;

const MEDIASOUP_RTC_MIN_PORT =
  Number(process.env.MEDIASOUP_RTC_MIN_PORT ?? "40000") || 40000;
const MEDIASOUP_RTC_MAX_PORT =
  Number(process.env.MEDIASOUP_RTC_MAX_PORT ?? "40100") || 40100;

type KubernetesClientModule = typeof import("@kubernetes/client-node");

let mediasoupAnnouncedIpPromise: Promise<string | undefined> | null = null;

async function resolveMediasoupAnnouncedIp(): Promise<string | undefined> {
  if (!mediasoupAnnouncedIpPromise) {
    mediasoupAnnouncedIpPromise = (async () => {
      const configuredAnnouncedIp = MEDIASOUP_ANNOUNCED_IP.trim();
      if (configuredAnnouncedIp) {
        return configuredAnnouncedIp;
      }

      // For non-kubernetes runtimes, rely only on explicit config.
      if (RUNTIME !== "kubernetes") {
        return undefined;
      }

      // Prefer explicit node external IP when provided by deployment.
      const explicitNodeExternalIp = process.env.K8S_NODE_EXTERNAL_IP?.trim();
      if (explicitNodeExternalIp) {
        return explicitNodeExternalIp;
      }

      const nodeName = process.env.K8S_NODE_NAME;
      if (!nodeName) {
        console.warn(
          "[mediasoup] K8S_NODE_NAME missing in kubernetes runtime; continuing without announcedIp",
        );
        return undefined;
      }

      let k8s: KubernetesClientModule;
      try {
        k8s =
          (await import("@kubernetes/client-node")) as KubernetesClientModule;
      } catch (error) {
        console.warn(
          "[mediasoup] Unable to load @kubernetes/client-node; continuing without announcedIp",
          error,
        );
        return undefined;
      }

      try {
        const kubeConfig = new k8s.KubeConfig();
        kubeConfig.loadFromCluster();
        const coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
        const nodeResponse = await coreV1Api.readNode({ name: nodeName });
        const node = (
          "body" in nodeResponse ? nodeResponse.body : nodeResponse
        ) as {
          metadata?: { labels?: Record<string, string | undefined> };
          status?: { addresses?: Array<{ type?: string; address?: string }> };
        };
        const externalIpFromLabel =
          node.metadata?.labels?.["external-ip"]?.trim();
        const externalIpFromStatus = node.status?.addresses
          ?.find((address) => address.type === "ExternalIP")
          ?.address?.trim();
        const resolvedExternalIp = externalIpFromLabel || externalIpFromStatus;

        if (!resolvedExternalIp) {
          console.warn(
            `[mediasoup] Unable to resolve node external IP for "${nodeName}"; continuing without announcedIp`,
          );
          return undefined;
        }

        return resolvedExternalIp;
      } catch (error) {
        console.warn(
          `[mediasoup] Failed to resolve announced IP from Kubernetes API for node "${nodeName}"; continuing without announcedIp`,
          error,
        );
        return undefined;
      }
    })();
  }

  return mediasoupAnnouncedIpPromise;
}

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/**
 * TURN is optional fallback only.
 * Direct UDP is the default and preferred path.
 * Get ICE servers configuration.
 * - Kubernetes: Fetches short-lived TURN credentials from Cloudflare
 * - VPS/Local: Returns STUN-only config
 */
async function getIceServers(): Promise<IceServer[]> {
  // Default STUN-only config (works for VPS with direct connectivity)
  const stunServers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  // Debug: Log environment state
  console.log("[ICE] RUNTIME:", RUNTIME);
  console.log("[ICE] CF_TURN_TOKEN_ID present:", !!CF_TURN_TOKEN_ID);
  console.log("[ICE] CF_TURN_API_TOKEN present:", !!CF_TURN_API_TOKEN);

  // Only fetch TURN credentials in Kubernetes
  if (RUNTIME !== "kubernetes") {
    console.log("[ICE] Skipping TURN: RUNTIME is not 'kubernetes'");
    return stunServers;
  }

  if (!CF_TURN_TOKEN_ID || !CF_TURN_API_TOKEN) {
    console.log(
      "[ICE] Skipping TURN: Missing CF_TURN_TOKEN_ID or CF_TURN_API_TOKEN",
    );
    return stunServers;
  }

  const apiUrl = `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_TOKEN_ID}/credentials/generate`;
  console.log("[ICE] Cloudflare TURN API URL:", apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 3600 }),
    });

    console.log("[ICE] Cloudflare API response status:", response.status);

    const responseText = await response.text();
    console.log("[ICE] Cloudflare API response body:", responseText);

    if (!response.ok) {
      console.error(
        `[ICE] Cloudflare TURN API error: ${response.status} ${response.statusText}`,
      );
      return stunServers;
    }

    const data = JSON.parse(responseText) as {
      iceServers: IceServer | IceServer[];
    };

    if (!data.iceServers) {
      console.error("[ICE] Cloudflare response missing iceServers:", data);
      return stunServers;
    }

    // Cloudflare returns iceServers as object, WebRTC expects array
    const turnServers: IceServer[] = Array.isArray(data.iceServers)
      ? data.iceServers
      : [data.iceServers];

    console.log(
      "[ICE] Successfully retrieved TURN servers:",
      turnServers.length,
    );

    // In Kubernetes: Use ONLY TURN over TCP for stability (no STUN, no UDP)
    // Filter to keep only turns: URLs with transport=tcp
    const tcpOnlyServers: IceServer[] = turnServers.map((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      let tcpUrls = urls.filter(
        (url) => url.startsWith("turns:") && url.includes("transport=tcp"),
      );
      // If no TCP URLs found, construct one as fallback
      if (tcpUrls.length === 0) {
        tcpUrls = ["turns:turn.cloudflare.com:5349?transport=tcp"];
      }
      const finalUrls: string | string[] =
        tcpUrls.length === 1 ? tcpUrls[0]! : tcpUrls;
      return {
        ...server,
        urls: finalUrls,
      };
    });

    console.log(
      "[ICE] Returning TCP-only TURN servers (K8s):",
      JSON.stringify(tcpOnlyServers),
    );
    return tcpOnlyServers;
  } catch (error) {
    console.error("[ICE] Failed to fetch Cloudflare TURN credentials:", error);
    return stunServers;
  }
}

let worker: Worker | null = null;
let routerInstance: Router | null = null;
let routerInitPromise: Promise<Router> | null = null;

function getPeerState(userId: string): PeerState {
  const existing = peers.get(userId);
  if (existing) return existing;
  const state: PeerState = {
    transports: new Map(),
    sendTransportId: undefined,
    recvTransportId: undefined,
    audioProducers: new Map(),
    videoEnabled: false,
    consumers: new Map(),
    consumersByProducerId: new Map(),
    consumerTransportByProducerId: new Map(),
  };
  peers.set(userId, state);
  return state;
}

function removeConsumerMappings(
  peerState: PeerState,
  consumerId: string,
  producerId: string,
) {
  peerState.consumers.delete(consumerId);
  const mappedConsumer = peerState.consumersByProducerId.get(producerId);
  if (mappedConsumer?.id === consumerId) {
    peerState.consumersByProducerId.delete(producerId);
    peerState.consumerTransportByProducerId.delete(producerId);
  }
}

function getAudioProximitySet(userId: string): Set<string> {
  let set = audioProximityPeers.get(userId);
  if (!set) {
    set = new Set();
    audioProximityPeers.set(userId, set);
  }
  return set;
}

function getVideoProximitySet(userId: string): Set<string> {
  let set = videoProximityPeers.get(userId);
  if (!set) {
    set = new Set();
    videoProximityPeers.set(userId, set);
  }
  return set;
}

function getMeetingKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function isMeetingActive(userA: string, userB: string): boolean {
  return activeMeetingsByUser.get(userA)?.has(userB) ?? false;
}

function setMeetingActive(userA: string, userB: string, active: boolean) {
  const setA = activeMeetingsByUser.get(userA) ?? new Set<string>();
  const setB = activeMeetingsByUser.get(userB) ?? new Set<string>();
  if (active) {
    setA.add(userB);
    setB.add(userA);
  } else {
    setA.delete(userB);
    setB.delete(userA);
  }
  activeMeetingsByUser.set(userA, setA);
  activeMeetingsByUser.set(userB, setB);
}

function enqueueMeetingPrompt(
  userA: string,
  userB: string,
  requestId: string,
  expiresAt: number,
) {
  enqueueAction(userA, {
    type: "meetingPrompt",
    peerId: userB,
    requestId,
    expiresAt,
  });
  enqueueAction(userB, {
    type: "meetingPrompt",
    peerId: userA,
    requestId,
    expiresAt,
  });
}

function enqueueMeetingStart(userA: string, userB: string) {
  enqueueAction(userA, { type: "meetingStart", peerId: userB });
  enqueueAction(userB, { type: "meetingStart", peerId: userA });
}

function enqueueMeetingEnd(userA: string, userB: string) {
  enqueueAction(userA, { type: "meetingEnd", peerId: userB });
  enqueueAction(userB, { type: "meetingEnd", peerId: userA });
}

function enqueueAction(userId: string, action: ProximityAction) {
  const queue = proximityQueues.get(userId) ?? [];
  queue.push(action);
  proximityQueues.set(userId, queue);
}

function enqueueConsumeForProducer(
  consumerUserId: string,
  producerUserId: string,
  producer: Producer,
) {
  enqueueAction(consumerUserId, {
    type: "consume",
    producerId: producer.id,
    producerUserId,
    kind: producer.kind,
  });
}

function enqueueStopForProducer(
  consumerUserId: string,
  producerUserId: string,
  producer: Producer,
) {
  enqueueAction(consumerUserId, {
    type: "stop",
    producerId: producer.id,
    producerUserId,
    kind: producer.kind,
  });
}

function enqueuePauseForProducer(
  consumerUserId: string,
  producerUserId: string,
  producer: Producer,
) {
  enqueueAction(consumerUserId, {
    type: "pause",
    producerId: producer.id,
    producerUserId,
    kind: producer.kind,
  });
}

function enqueueResumeForProducer(
  consumerUserId: string,
  producerUserId: string,
  producer: Producer,
) {
  enqueueAction(consumerUserId, {
    type: "resume",
    producerId: producer.id,
    producerUserId,
    kind: producer.kind,
  });
}

function enqueueConsumeOrResume(
  consumerUserId: string,
  producerUserId: string,
  producer: Producer,
) {
  const isKubernetes = RUNTIME === "kubernetes";
  const consumerState = peers.get(consumerUserId);
  const existingConsumer = consumerState?.consumersByProducerId.get(
    producer.id,
  );
  if (existingConsumer) {
    existingConsumer.resume();
    // Always request keyframe on resume for video, regardless of runtime
    // This is critical for the decoder to start rendering
    if (producer.kind === "video") {
      try {
        existingConsumer.requestKeyFrame();
      } catch (error) {
        console.warn("Failed to request keyframe on resume:", error);
      }
    }
    enqueueResumeForProducer(consumerUserId, producerUserId, producer);
    return;
  }
  enqueueConsumeForProducer(consumerUserId, producerUserId, producer);
}

function enqueueMeetingMedia(userA: string, userB: string) {
  const stateA = peers.get(userA);
  const stateB = peers.get(userB);

  if (!stateA || !stateB) return;

  for (const producer of stateA.audioProducers.values()) {
    enqueueConsumeOrResume(userB, userA, producer);
  }
  for (const producer of stateB.audioProducers.values()) {
    enqueueConsumeOrResume(userA, userB, producer);
  }

  if (stateA.videoProducer) {
    enqueueConsumeOrResume(userB, userA, stateA.videoProducer);
  } else {
  }

  if (stateB.videoProducer) {
    enqueueConsumeOrResume(userA, userB, stateB.videoProducer);
  } else {
  }
}

async function getRouter(): Promise<Router> {
  if (routerInstance) return routerInstance;
  if (routerInitPromise) return routerInitPromise;

  routerInitPromise = (async () => {
    const announcedIp = await resolveMediasoupAnnouncedIp();
    console.log(
      `[mediasoup] announcedIp resolved to: ${announcedIp ?? "undefined"}`,
    );

    worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: MEDIASOUP_RTC_MIN_PORT,
      rtcMaxPort: MEDIASOUP_RTC_MAX_PORT,
    });

    console.log(
      "[mediasoup] Worker created",
      JSON.stringify({
        rtcMinPort: MEDIASOUP_RTC_MIN_PORT,
        rtcMaxPort: MEDIASOUP_RTC_MAX_PORT,
      }),
    );

    worker.on("died", () => {
      console.error("mediasoup worker died, exiting in 2s...");
      setTimeout(() => process.exit(1), 2000);
    });

    routerInstance = await worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
      ],
    });

    return routerInstance;
  })();

  return routerInitPromise;
}

export const mediasoupRouter = router({
  createDevice: protectedProcedure
    .output(createDeviceOutputSchema)
    .query(async () => {
      const router = await getRouter();
      const iceServers = await getIceServers();
      return {
        routerRtpCapabilities: router.rtpCapabilities,
        iceServers,
        forceRelay: false,
      };
    }),

  createTransport: protectedProcedure
    .input(createTransportInputSchema)
    .output(transportParamsSchema)
    .mutation(async ({ ctx, input }) => {
      const router = await getRouter();
      const announcedIp = await resolveMediasoupAnnouncedIp();
      const peerState = getPeerState(ctx.user.userId);

      // In Kubernetes: Use TCP-only transport for TURN/TCP stability
      // In VPS/local: Use UDP for low-latency direct connections
      const isKubernetes = RUNTIME === "kubernetes";

      if (isKubernetes) {
        console.log(
          `[Transport] Creating TCP-only transport for ${input.direction} (K8s mode)`,
        );
      }

      const previousTransportId =
        input.direction === "send"
          ? peerState.sendTransportId
          : peerState.recvTransportId;

      if (previousTransportId) {
        const previousTransport = peerState.transports.get(previousTransportId);
        if (previousTransport && !previousTransport.closed) {
          try {
            previousTransport.close();
          } catch (error) {
            console.warn(
              `[Transport] Failed to close previous ${input.direction} transport (${previousTransportId}) for user=${ctx.user.userId}:`,
              error,
            );
          }
        }
        peerState.transports.delete(previousTransportId);
      }

      // A fresh recv transport must not reuse consumers created on a previous
      // transport, otherwise browser SDP can fail with duplicate m= mids.
      if (input.direction === "recv" && peerState.consumers.size > 0) {
        for (const consumer of peerState.consumers.values()) {
          try {
            consumer.close();
          } catch {
            // Ignore cleanup errors while replacing recv transport.
          }
        }
        peerState.consumers.clear();
        peerState.consumersByProducerId.clear();
        peerState.consumerTransportByProducerId.clear();
      }

      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: MEDIASOUP_LISTEN_IP,
            announcedIp,
          },
        ],
        enableUdp: !isKubernetes,
        enableTcp: true,
        preferUdp: !isKubernetes,
        enableSctp: isKubernetes ? false : undefined,
        // Lower initial bitrate for TCP to prevent congestion-induced stalls
        initialAvailableOutgoingBitrate: isKubernetes ? 250_000 : undefined,
        appData: { userId: ctx.user.userId, direction: input.direction },
      });

      if (isKubernetes) {
        try {
          await transport.setMaxIncomingBitrate(300_000);
          console.log(
            `[Transport] Set maxIncomingBitrate=300kbps for TCP transport id=${transport.id}`,
          );
        } catch (error) {
          console.warn(
            "[Transport] Failed to set maxIncomingBitrate on TCP transport:",
            error,
          );
        }

        console.log(
          `[Transport] TCP transport created: id=${transport.id}, initialOutgoingBitrate=250kbps, maxIncomingBitrate=300kbps`,
        );
      }

      transport.on("dtlsstatechange", (state: string) => {
        if (state === "closed") {
          transport.close();
          peerState.transports.delete(transport.id);
          if (peerState.sendTransportId === transport.id) {
            peerState.sendTransportId = undefined;
          }
          if (peerState.recvTransportId === transport.id) {
            peerState.recvTransportId = undefined;
          }
        }
      });

      peerState.transports.set(transport.id, transport);
      if (input.direction === "send") {
        peerState.sendTransportId = transport.id;
      } else {
        peerState.recvTransportId = transport.id;
      }

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
      };
    }),

  connectTransport: protectedProcedure
    .input(connectTransportInputSchema)
    .output(connectTransportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const transport = peerState.transports.get(input.transportId);
      if (!transport) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transport not found",
        });
      }

      await transport.connect({
        dtlsParameters: input.dtlsParameters as DtlsParameters,
      });
      return { success: true };
    }),

  produce: protectedProcedure
    .input(produceInputSchema)
    .output(produceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const transport = peerState.transports.get(input.transportId);
      if (!transport) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transport not found",
        });
      }

      const isKubernetes = RUNTIME === "kubernetes";
      let rtpParameters = input.rtpParameters as RtpParameters;

      // In Kubernetes: prevent more than one video producer per peer.
      // Ignore duplicate produce(video) calls to avoid thrashing TCP TURN.
      if (isKubernetes && input.kind === "video" && peerState.videoProducer) {
        console.warn(
          `[Producer] Rejecting duplicate video producer for user=${ctx.user.userId} (existingProducerId=${peerState.videoProducer.id})`,
        );
        return {
          producerId: peerState.videoProducer.id,
          kind: "video" as const,
        };
      }

      // In Kubernetes: Cap video bitrate and disable simulcast / temporal layers
      // - Single encoding only
      // - maxBitrate hard cap: 350 kbps
      // - No scalabilityMode (disables temporal layers)
      if (isKubernetes && input.kind === "video") {
        const maxVideoBitrate = 350_000; // 350 kbps max for TCP stability
        console.log(
          `[Producer] Applying TCP-safe video settings (K8s mode): maxBitrate=${maxVideoBitrate / 1000}kbps`,
        );

        const baseEncoding =
          rtpParameters.encodings && rtpParameters.encodings[0]
            ? rtpParameters.encodings[0]
            : {};

        const singleEncoding = {
          ...baseEncoding,
          maxBitrate: Math.min(
            (baseEncoding as any).maxBitrate ?? maxVideoBitrate,
            maxVideoBitrate,
          ),
          scalabilityMode: undefined,
        };

        rtpParameters = {
          ...rtpParameters,
          encodings: [singleEncoding],
        };
      }

      const codecOptions =
        isKubernetes && input.kind === "video"
          ? {
              // Conservative VP8 behavior for TURN/TCP
              videoGoogleStartBitrate: 250_000,
              videoGoogleMaxBitrate: 350_000,
              // Approximate 4s keyframe interval
              videoGoogleMaxKeyframeInterval: 4,
            }
          : undefined;

      const produceOptions: any = {
        kind: input.kind,
        rtpParameters,
        appData: input.appData as AppData,
      };
      if (codecOptions) {
        produceOptions.codecOptions = codecOptions;
      }

      const producer = await transport.produce(produceOptions);

      if (isKubernetes && input.kind === "video") {
        console.log(
          `[Producer] Video producer created (K8s TCP mode): id=${producer.id}, encodings=${JSON.stringify(
            rtpParameters.encodings,
          )}`,
        );
      }

      if (producer.kind === "video") {
        if (
          peerState.videoProducer &&
          peerState.videoProducer.id !== producer.id
        ) {
          peerState.videoProducer.close();
        }
        peerState.videoProducer = producer;
        peerState.videoEnabled = true;
      } else {
        peerState.audioProducers.set(producer.id, producer);
      }

      producer.on("transportclose", () => {
        if (producer.kind === "video") {
          if (peerState.videoProducer?.id === producer.id) {
            peerState.videoProducer = undefined;
            peerState.videoEnabled = false;
          }
        } else {
          peerState.audioProducers.delete(producer.id);
        }
      });

      if (producer.kind === "video") {
        const meetingPeers = activeMeetingsByUser.get(ctx.user.userId);
        if (meetingPeers) {
          for (const otherUserId of meetingPeers) {
            enqueueConsumeOrResume(otherUserId, ctx.user.userId, producer);
          }
        }
      } else {
        const nearby = audioProximityPeers.get(ctx.user.userId);
        if (nearby) {
          for (const otherUserId of nearby) {
            enqueueConsumeForProducer(otherUserId, ctx.user.userId, producer);
          }
        }
        const meetingPeers = activeMeetingsByUser.get(ctx.user.userId);
        if (meetingPeers) {
          for (const otherUserId of meetingPeers) {
            enqueueConsumeOrResume(otherUserId, ctx.user.userId, producer);
          }
        }
      }

      return { producerId: producer.id, kind: producer.kind };
    }),

  consume: protectedProcedure
    .input(consumeInputSchema)
    .output(consumeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const router = await getRouter();
      const peerState = getPeerState(ctx.user.userId);
      const transport = peerState.transports.get(input.transportId);
      if (!transport) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transport not found",
        });
      }

      if (
        !router.canConsume({
          producerId: input.producerId,
          rtpCapabilities: input.rtpCapabilities as RtpCapabilities,
        })
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot consume this producer with provided capabilities",
        });
      }

      const existingConsumer = peerState.consumersByProducerId.get(
        input.producerId,
      );
      if (existingConsumer) {
        const existingTransportId = peerState.consumerTransportByProducerId.get(
          input.producerId,
        );

        if (
          !existingConsumer.closed &&
          existingTransportId === input.transportId
        ) {
          if (RUNTIME === "kubernetes") {
            console.log(
              `[Consumer] Kubernetes relay mode: reusing existing consumer for producer=${input.producerId}`,
            );
          }
          return {
            id: existingConsumer.id,
            producerId: input.producerId,
            kind: existingConsumer.kind,
            rtpParameters: existingConsumer.rtpParameters,
          };
        }

        if (
          !existingConsumer.closed &&
          existingTransportId !== input.transportId
        ) {
          console.warn(
            `[Consumer] Replacing stale consumer for producer=${input.producerId} (oldTransport=${existingTransportId ?? "unknown"}, newTransport=${input.transportId})`,
          );
          try {
            existingConsumer.close();
          } catch {
            // Ignore close errors and continue with map cleanup/re-create.
          }
        }

        removeConsumerMappings(
          peerState,
          existingConsumer.id,
          input.producerId,
        );
      }

      const consumer = await transport.consume({
        producerId: input.producerId,
        rtpCapabilities: input.rtpCapabilities as ConsumerRtpCapabilities,
        paused: true,
      });

      peerState.consumers.set(consumer.id, consumer);
      peerState.consumersByProducerId.set(input.producerId, consumer);
      peerState.consumerTransportByProducerId.set(
        input.producerId,
        input.transportId,
      );

      // Only auto-resume AUDIO consumers on the server
      // Video MUST stay paused until client explicitly calls resumeConsumer
      // This ensures the keyframe isn't sent before client creates local consumer
      if (consumer.kind === "audio") {
        await consumer.resume();
      }

      consumer.on("transportclose", () => {
        removeConsumerMappings(peerState, consumer.id, input.producerId);
      });

      consumer.on("producerclose", () => {
        removeConsumerMappings(peerState, consumer.id, input.producerId);
      });

      return {
        id: consumer.id,
        producerId: input.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    }),

  closeConsumer: protectedProcedure
    .input(closeConsumerInputSchema)
    .output(closeConsumerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const consumer = peerState.consumers.get(input.consumerId);
      if (!consumer) {
        return { success: true };
      }

      consumer.close();
      removeConsumerMappings(peerState, input.consumerId, consumer.producerId);
      return { success: true };
    }),

  pauseConsumer: protectedProcedure
    .input(pauseConsumerInputSchema)
    .output(pauseConsumerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const consumer = peerState.consumers.get(input.consumerId);
      if (!consumer) {
        return { success: true };
      }

      await consumer.pause();
      return { success: true };
    }),

  resumeConsumer: protectedProcedure
    .input(resumeConsumerInputSchema)
    .output(resumeConsumerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const consumer = peerState.consumers.get(input.consumerId);
      if (!consumer) {
        return { success: true };
      }

      await consumer.resume();

      if (consumer.kind === "video") {
        try {
          await consumer.requestKeyFrame();
          if (RUNTIME === "kubernetes") {
            console.log(
              `[Consumer] K8s relay mode: Resumed video consumer + requested keyframe (${consumer.id})`,
            );
          }
        } catch (error) {
          console.warn("Failed to request keyframe on resume:", error);
        }
      }
      return { success: true };
    }),

  requestKeyFrame: protectedProcedure
    .input(requestKeyFrameInputSchema)
    .output(requestKeyFrameOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const consumer = peerState.consumers.get(input.consumerId);
      if (!consumer || consumer.kind !== "video") {
        return { success: true };
      }

      // Always allow explicit keyframe requests - they are cheap and essential for recovery
      // if (RUNTIME === "kubernetes") { ... }  <-- REMOVED BLOCK

      try {
        await consumer.requestKeyFrame();
      } catch (error) {
        console.warn("Failed to request keyframe:", error);
      }
      return { success: true };
    }),

  closeProducer: protectedProcedure
    .input(closeProducerInputSchema)
    .output(closeProducerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const peerState = getPeerState(ctx.user.userId);
      const videoProducer = peerState.videoProducer;
      if (videoProducer && videoProducer.id === input.producerId) {
        videoProducer.close();
        peerState.videoProducer = undefined;
        peerState.videoEnabled = false;
        return { success: true };
      }

      const audioProducer = peerState.audioProducers.get(input.producerId);
      if (audioProducer) {
        audioProducer.close();
        peerState.audioProducers.delete(input.producerId);
      }

      return { success: true };
    }),

  meetingRespond: protectedProcedure
    .input(meetingRespondInputSchema)
    .output(meetingRespondOutputSchema)
    .mutation(({ ctx, input }) => {
      const now = Date.now();
      const meetingKey = getMeetingKey(ctx.user.userId, input.peerId);
      const state = meetingStates.get(meetingKey);

      if (!state) {
        return { success: true };
      }
      if (
        input.requestId !== "SKIP_CHECK" &&
        state.requestId !== input.requestId
      ) {
        return { success: true };
      }

      if (state.expiresAt && state.expiresAt < now) {
        meetingStates.set(meetingKey, {
          ...state,
          requestId: "",
          expiresAt: 0,
          acceptA: false,
          acceptB: false,
          cooldownUntil: now + MEETING_COOLDOWN_MS,
        });
        return { success: true };
      }

      if (!input.accept) {
        meetingStates.set(meetingKey, {
          ...state,
          requestId: "",
          expiresAt: 0,
          acceptA: false,
          acceptB: false,
          active: false,
          cooldownUntil: now + MEETING_COOLDOWN_MS,
        });
        return { success: true };
      }

      if (ctx.user.userId === state.userA) {
        state.acceptA = true;
      } else if (ctx.user.userId === state.userB) {
        state.acceptB = true;
      }

      if (state.acceptA && state.acceptB) {
        // Remove aggressive debounce that might drop valid meeting starts
        // if (RUNTIME === "kubernetes") { ... } <-- REMOVED BLOCK

        state.active = true;
        state.requestId = "";
        state.expiresAt = 0;
        meetingStates.set(meetingKey, state);
        setMeetingActive(state.userA, state.userB, true);
        enqueueMeetingStart(state.userA, state.userB);

        enqueueMeetingMedia(state.userA, state.userB);
        return { success: true };
      }

      meetingStates.set(meetingKey, state);
      return { success: true };
    }),

  meetingEnd: protectedProcedure
    .input(meetingEndInputSchema)
    .output(meetingEndOutputSchema)
    .mutation(({ ctx, input }) => {
      const now = Date.now();
      const meetingKey = getMeetingKey(ctx.user.userId, input.peerId);
      const state = meetingStates.get(meetingKey);
      if (!state) {
        return { success: true };
      }

      state.active = false;
      state.requestId = "";
      state.expiresAt = 0;
      state.acceptA = false;
      state.acceptB = false;
      state.cooldownUntil = now + MEETING_COOLDOWN_MS;
      meetingStates.set(meetingKey, state);
      setMeetingActive(state.userA, state.userB, false);
      enqueueMeetingEnd(state.userA, state.userB);

      const stateA = peers.get(state.userA);
      const stateB = peers.get(state.userB);

      if (stateA?.videoProducer) {
        enqueuePauseForProducer(state.userB, state.userA, stateA.videoProducer);
      }
      if (stateB?.videoProducer) {
        enqueuePauseForProducer(state.userA, state.userB, stateB.videoProducer);
      }

      const audioSetA = audioProximityPeers.get(state.userA);
      if (!audioSetA?.has(state.userB)) {
        if (stateA) {
          for (const producer of stateA.audioProducers.values()) {
            enqueueStopForProducer(state.userB, state.userA, producer);
          }
        }
        if (stateB) {
          for (const producer of stateB.audioProducers.values()) {
            enqueueStopForProducer(state.userA, state.userB, producer);
          }
        }
      }

      return { success: true };
    }),

  getPeerProducers: protectedProcedure
    .input(z.object({ peerId: z.string() }))
    .query(({ input }) => {
      const peerState = peers.get(input.peerId);
      const producers: { producerId: string; kind: "audio" | "video" }[] = [];

      if (peerState) {
        for (const [id, producer] of peerState.audioProducers) {
          producers.push({ producerId: id, kind: "audio" });
        }
        if (peerState.videoProducer) {
          producers.push({
            producerId: peerState.videoProducer.id,
            kind: "video",
          });
        }
      }
      return producers;
    }),

  proximityUpdate: publicProcedure
    .input(proximityUpdateInputSchema)
    .mutation(({ input }) => {
      if (WORLD_SERVER_SECRET && input.secret !== WORLD_SERVER_SECRET) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      for (const event of input.events) {
        const media = event.media ?? "audio";
        // Video is proximity-controlled: production is user-driven, consumption is optional.
        if (media === "video") {
          const setA = getVideoProximitySet(event.userA);
          const setB = getVideoProximitySet(event.userB);
          const now = Date.now();
          const meetingKey = getMeetingKey(event.userA, event.userB);
          const state = meetingStates.get(meetingKey);

          if (event.type === "enter") {
            setA.add(event.userB);
            setB.add(event.userA);

            if (state?.active) {
              continue;
            }

            if (state?.requestId && state.expiresAt > now) {
              continue;
            }

            if (state?.cooldownUntil && state.cooldownUntil > now) {
              continue;
            }

            const requestId = crypto.randomUUID();
            const expiresAt = now + MEETING_TIMEOUT_MS;
            meetingStates.set(meetingKey, {
              requestId,
              userA: event.userA,
              userB: event.userB,
              acceptA: false,
              acceptB: false,
              expiresAt,
              active: false,
              cooldownUntil: 0,
            });
            enqueueMeetingPrompt(
              event.userA,
              event.userB,
              requestId,
              expiresAt,
            );
          } else {
            setA.delete(event.userB);
            setB.delete(event.userA);
            if (state?.active) {
              continue;
            }
            if (state?.requestId && state.expiresAt > now) {
              meetingStates.set(meetingKey, {
                ...state,
                requestId: "",
                expiresAt: 0,
                acceptA: false,
                acceptB: false,
                cooldownUntil: now + MEETING_COOLDOWN_MS,
              });
            }
          }
          continue;
        }

        const setA = getAudioProximitySet(event.userA);
        const setB = getAudioProximitySet(event.userB);
        const meetingActive = isMeetingActive(event.userA, event.userB);

        if (event.type === "enter") {
          setA.add(event.userB);
          setB.add(event.userA);
          if (meetingActive) {
            continue;
          }

          const producersA = peers.get(event.userA)?.audioProducers;
          if (producersA) {
            for (const producer of producersA.values()) {
              enqueueConsumeForProducer(event.userB, event.userA, producer);
            }
          }

          const producersB = peers.get(event.userB)?.audioProducers;
          if (producersB) {
            for (const producer of producersB.values()) {
              enqueueConsumeForProducer(event.userA, event.userB, producer);
            }
          }
        } else {
          setA.delete(event.userB);
          setB.delete(event.userA);
          if (meetingActive) {
            continue;
          }

          const producersA = peers.get(event.userA)?.audioProducers;
          if (producersA) {
            for (const producer of producersA.values()) {
              enqueueStopForProducer(event.userB, event.userA, producer);
            }
          }

          const producersB = peers.get(event.userB)?.audioProducers;
          if (producersB) {
            for (const producer of producersB.values()) {
              enqueueStopForProducer(event.userA, event.userB, producer);
            }
          }
        }
      }

      return { success: true };
    }),
});
