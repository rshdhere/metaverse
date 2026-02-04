import { TRPCError } from "@trpc/server";
import mediasoup from "mediasoup";
import {
  WORLD_SERVER_SECRET,
  MEDIASOUP_LISTEN_IP,
  MEDIASOUP_ANNOUNCED_IP,
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
  audioProducers: Map<string, Producer>;
  videoProducer?: Producer;
  videoEnabled: boolean;
  consumers: Map<string, Consumer>;
  consumersByProducerId: Map<string, Consumer>;
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
const MEETING_TIMEOUT_MS = 15000;
const MEETING_COOLDOWN_MS = 10000;

let worker: Worker | null = null;
let routerInstance: Router | null = null;
let routerInitPromise: Promise<Router> | null = null;

function getPeerState(userId: string): PeerState {
  const existing = peers.get(userId);
  if (existing) return existing;
  const state: PeerState = {
    transports: new Map(),
    audioProducers: new Map(),
    videoEnabled: false,
    consumers: new Map(),
    consumersByProducerId: new Map(),
  };
  peers.set(userId, state);
  return state;
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
  const consumerState = peers.get(consumerUserId);
  const existingConsumer = consumerState?.consumersByProducerId.get(
    producer.id,
  );
  if (existingConsumer) {
    existingConsumer.resume();
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
  console.log(`enqueueMeetingMedia: Checking media for ${userA} and ${userB}`);
  const stateA = peers.get(userA);
  const stateB = peers.get(userB);

  // Debug why state might be missing
  if (!stateA)
    console.log(
      `enqueueMeetingMedia: Peer state for userA (${userA}) not found`,
    );
  if (!stateB)
    console.log(
      `enqueueMeetingMedia: Peer state for userB (${userB}) not found`,
    );

  if (!stateA || !stateB) return;

  console.log(
    `enqueueMeetingMedia: Found peer states. ProducersA=${stateA.audioProducers.size}, ProducersB=${stateB.audioProducers.size}`,
  );

  for (const producer of stateA.audioProducers.values()) {
    console.log(
      `enqueueMeetingMedia: Enqueuing audio from A to B: ${producer.id}`,
    );
    enqueueConsumeOrResume(userB, userA, producer);
  }
  for (const producer of stateB.audioProducers.values()) {
    console.log(
      `enqueueMeetingMedia: Enqueuing audio from B to A: ${producer.id}`,
    );
    enqueueConsumeOrResume(userA, userB, producer);
  }

  if (stateA.videoProducer) {
    console.log(
      `enqueueMeetingMedia: Enqueuing video from A to B: ${stateA.videoProducer.id}`,
    );
    enqueueConsumeOrResume(userB, userA, stateA.videoProducer);
  } else {
    console.log(`enqueueMeetingMedia: No video producer for userA (${userA})`);
  }

  if (stateB.videoProducer) {
    console.log(
      `enqueueMeetingMedia: Enqueuing video from B to A: ${stateB.videoProducer.id}`,
    );
    enqueueConsumeOrResume(userA, userB, stateB.videoProducer);
  } else {
    console.log(`enqueueMeetingMedia: No video producer for userB (${userB})`);
  }
}

async function getRouter(): Promise<Router> {
  if (routerInstance) return routerInstance;
  if (routerInitPromise) return routerInitPromise;

  routerInitPromise = (async () => {
    worker = await mediasoup.createWorker({
      logLevel: "warn",
    });

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
      return { routerRtpCapabilities: router.rtpCapabilities };
    }),

  createTransport: protectedProcedure
    .input(createTransportInputSchema)
    .output(transportParamsSchema)
    .mutation(async ({ ctx, input }) => {
      const router = await getRouter();
      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: MEDIASOUP_LISTEN_IP,
            announcedIp: MEDIASOUP_ANNOUNCED_IP || undefined,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: { userId: ctx.user.userId, direction: input.direction },
      });

      transport.on("dtlsstatechange", (state: string) => {
        if (state === "closed") {
          transport.close();
        }
      });

      const peerState = getPeerState(ctx.user.userId);
      peerState.transports.set(transport.id, transport);

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

      const producer = await transport.produce({
        kind: input.kind,
        rtpParameters: input.rtpParameters as RtpParameters,
        appData: input.appData as AppData,
      });

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

      const consumer = await transport.consume({
        producerId: input.producerId,
        rtpCapabilities: input.rtpCapabilities as ConsumerRtpCapabilities,
        paused: true,
      });

      // Log the producer-consumer pairing for debugging
      console.log(`📡 Consumer created:`, {
        consumerId: consumer.id,
        producerId: input.producerId,
        kind: consumer.kind,
        consumerPaused: consumer.paused,
        userId: ctx.user.userId,
      });

      peerState.consumers.set(consumer.id, consumer);
      peerState.consumersByProducerId.set(input.producerId, consumer);

      // Only auto-resume AUDIO consumers on the server
      // Video MUST stay paused until client explicitly calls resumeConsumer
      // This ensures the keyframe isn't sent before client creates local consumer
      if (consumer.kind === "audio") {
        await consumer.resume();
      }

      consumer.on("transportclose", () => {
        peerState.consumers.delete(consumer.id);
        peerState.consumersByProducerId.delete(input.producerId);
      });

      consumer.on("producerclose", () => {
        peerState.consumers.delete(consumer.id);
        peerState.consumersByProducerId.delete(input.producerId);
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
      peerState.consumers.delete(input.consumerId);
      peerState.consumersByProducerId.delete(consumer.producerId);
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
        console.log(
          `📡 resumeConsumer: Consumer not found: ${input.consumerId}`,
        );
        return { success: true };
      }

      console.log(`📡 resumeConsumer: Resuming consumer:`, {
        consumerId: consumer.id,
        kind: consumer.kind,
        pausedBefore: consumer.paused,
      });

      await consumer.resume();

      console.log(
        `📡 resumeConsumer: Consumer resumed, paused=${consumer.paused}`,
      );

      if (consumer.kind === "video") {
        try {
          await consumer.requestKeyFrame();
          console.log(
            `📡 resumeConsumer: Keyframe requested for video consumer ${consumer.id}`,
          );
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

      console.log(
        `meetingRespond: User=${ctx.user.userId} Peer=${input.peerId} Key=${meetingKey} RequestId=${input.requestId} Accept=${input.accept}`,
      );

      if (!state) {
        console.log(`meetingRespond: No state found for key ${meetingKey}`);
        return { success: true };
      }
      if (
        input.requestId !== "SKIP_CHECK" &&
        state.requestId !== input.requestId
      ) {
        console.log(
          `meetingRespond: Request ID mismatch. State=${state.requestId} Input=${input.requestId}`,
        );
        return { success: true };
      }

      if (state.expiresAt && state.expiresAt < now) {
        console.log(
          `meetingRespond: Request expired. Expires=${state.expiresAt} Now=${now}`,
        );
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
        console.log("meetingRespond: User declined");
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

      console.log(
        `meetingRespond: New State: AcceptA=${state.acceptA} AcceptB=${state.acceptB}`,
      );

      if (state.acceptA && state.acceptB) {
        console.log("meetingRespond: Both accepted! Starting meeting.");
        state.active = true;
        state.requestId = "";
        state.expiresAt = 0;
        meetingStates.set(meetingKey, state);
        setMeetingActive(state.userA, state.userB, true);
        enqueueMeetingStart(state.userA, state.userB);
        enqueueMeetingStart(state.userA, state.userB);
        console.log("meetingRespond: Enqueuing meeting media...");
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
      console.log(
        `❌ meetingEnd mutation called by ${ctx.user.userId} for peer ${input.peerId}`,
      );
      const now = Date.now();
      const meetingKey = getMeetingKey(ctx.user.userId, input.peerId);
      const state = meetingStates.get(meetingKey);
      if (!state) {
        console.log(`meetingEnd: No meeting state found for key ${meetingKey}`);
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
