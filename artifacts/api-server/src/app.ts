import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import controlRoomRouter from "./routes/controlRoom";
import embedRouter from "./routes/embed";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
// The designer tab's JavaScript. It is a real file rather than more of controlRoom.ts's
// template literal: a backslash in that literal becomes a real character in the served page
// and TypeScript checks none of the JS inside it. Mounted before the Control Room router --
// express.static only answers for files that exist, so the page itself still falls through.
app.use("/control-room", express.static(path.resolve(__dirname, "../public"), { maxAge: 0 }));
app.use("/control-room", controlRoomRouter);
// Public, framable widgets for the websites (the song request form). Reachable from
// outside only because ejazz-proxy forwards /embed/ here.
app.use("/embed", embedRouter);

export default app;
