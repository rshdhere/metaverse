import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { createContext } from "@repo/api/trpc";
import { BACKEND_PORT } from "@repo/config";
import { CORS_ORIGINS } from "@repo/config/constants";
import { appRouter } from "./index";

const server = createHTTPServer({
  middleware: cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
  router: appRouter,
  createContext,
});

server.listen(BACKEND_PORT);
console.log(`tRPC server listening on http://localhost:${BACKEND_PORT}`);
