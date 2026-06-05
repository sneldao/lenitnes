import cron from "node-cron";
import { runDueChecks } from "./execution/loop.js";

// ─────────────────────────────────────────────────────────────
// Scheduled monitor execution. Runs every minute; each monitor's own
// frequency_seconds + last_check_at decides whether it is actually due.
// For higher throughput, swap node-cron for a BullMQ queue.
// ─────────────────────────────────────────────────────────────

console.log("LENITNES worker started — scanning for due monitors every minute.");

let running = false;
cron.schedule("* * * * *", async () => {
  if (running) return; // avoid overlapping passes
  running = true;
  try {
    await runDueChecks();
  } catch (err) {
    console.error("[worker] runDueChecks failed:", err);
  } finally {
    running = false;
  }
});
