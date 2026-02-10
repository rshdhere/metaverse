import { z } from "zod";

const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const createDeviceOutputSchema = z.object({
  // mediasoup Router RTP capabilities (opaque to the client)
  routerRtpCapabilities: z.unknown(),
  // ICE servers for WebRTC (STUN/TURN)
  iceServers: z.array(iceServerSchema),
});

export const createTransportInputSchema = z.object({
  direction: z.enum(["send", "recv"]),
});

export const transportParamsSchema = z.object({
  id: z.string(),
  iceParameters: z.unknown(),
  iceCandidates: z.array(z.unknown()),
  dtlsParameters: z.unknown(),
  sctpParameters: z.unknown().optional(),
});

export const connectTransportInputSchema = z.object({
  transportId: z.string(),
  dtlsParameters: z.unknown(),
});

export const connectTransportOutputSchema = z.object({
  success: z.literal(true),
});

export const produceInputSchema = z.object({
  transportId: z.string(),
  kind: z.enum(["audio", "video"]),
  rtpParameters: z.unknown(),
  appData: z.unknown().optional(),
});

export const produceOutputSchema = z.object({
  producerId: z.string(),
  kind: z.enum(["audio", "video"]),
});

export const consumeInputSchema = z.object({
  transportId: z.string(),
  producerId: z.string(),
  rtpCapabilities: z.unknown(),
});

export const consumeOutputSchema = z.object({
  id: z.string(),
  producerId: z.string(),
  kind: z.enum(["audio", "video"]),
  rtpParameters: z.unknown(),
});

export const closeConsumerInputSchema = z.object({
  consumerId: z.string(),
});

export const closeConsumerOutputSchema = z.object({
  success: z.literal(true),
});

export const pauseConsumerInputSchema = z.object({
  consumerId: z.string(),
});

export const pauseConsumerOutputSchema = z.object({
  success: z.literal(true),
});

export const resumeConsumerInputSchema = z.object({
  consumerId: z.string(),
});

export const resumeConsumerOutputSchema = z.object({
  success: z.literal(true),
});

export const requestKeyFrameInputSchema = z.object({
  consumerId: z.string(),
});

export const requestKeyFrameOutputSchema = z.object({
  success: z.literal(true),
});

export const closeProducerInputSchema = z.object({
  producerId: z.string(),
});

export const closeProducerOutputSchema = z.object({
  success: z.literal(true),
});

export const proximityEventSchema = z.object({
  type: z.enum(["enter", "leave"]),
  userA: z.string(),
  userB: z.string(),
  spaceId: z.string().optional(),
  media: z.enum(["audio", "video"]).optional(),
});

export const proximityUpdateInputSchema = z.object({
  events: z.array(proximityEventSchema).min(1),
  secret: z.string().optional(),
});

const proximityMediaActionSchema = z.object({
  type: z.enum(["consume", "stop", "pause", "resume"]),
  producerId: z.string(),
  producerUserId: z.string(),
  kind: z.enum(["audio", "video"]),
});

const meetingActionSchema = z.object({
  type: z.enum(["meetingPrompt", "meetingStart", "meetingEnd"]),
  peerId: z.string(),
  requestId: z.string().optional(),
  expiresAt: z.number().optional(),
});

export const proximityActionSchema = z.union([
  proximityMediaActionSchema,
  meetingActionSchema,
]);

export const proximityActionListSchema = z.array(proximityActionSchema);

export const meetingRespondInputSchema = z.object({
  requestId: z.string(),
  peerId: z.string(),
  accept: z.boolean(),
});

export const meetingRespondOutputSchema = z.object({
  success: z.literal(true),
});

export const meetingEndInputSchema = z.object({
  peerId: z.string(),
});

export const meetingEndOutputSchema = z.object({
  success: z.literal(true),
});
