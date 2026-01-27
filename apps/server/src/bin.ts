import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { createContext } from "@repo/api/trpc";
import { BACKEND_PORT } from "@repo/config";
import { appRouter } from "./index";

const server = createHTTPServer({
  middleware: cors({
    origin: ["http://localhost:3000", "https://yourdomain.com"],
    credentials: true,
  }),
  router: appRouter,
  createContext,
});

server.listen(BACKEND_PORT);
console.log(`tRPC server listening on http://localhost:${BACKEND_PORT}`);
