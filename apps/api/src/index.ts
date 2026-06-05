import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { monitorsRouter } from "./routes/monitors.js";
import { signalsRouter } from "./routes/signals.js";
import { rulesRouter } from "./routes/rules.js";
import { webhooksRouter } from "./routes/webhooks.js";

const app = express();
app.use(cors({ origin: config.webOrigin }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "lenitnes-api" }));

app.use("/monitors", monitorsRouter);
app.use("/signals", signalsRouter);
app.use("/rules", rulesRouter);
app.use("/webhooks", webhooksRouter);

// Centralized error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  console.log(`LENITNES API listening on :${config.port} (${config.env})`);
});
