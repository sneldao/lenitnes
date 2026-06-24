import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// Production: sync stdout so docker logs / journalctl always see
// every line, even on a clean shutdown. SonicBoom's default async
// destination can lose the last few lines (and an entire scheduler
// cycle's worth of work) when the process is restarted by SIGTERM.
// pino.destination({ sync: true }) costs ~5% throughput per the pino
// docs — well worth it for a single-process worker. See
// https://github.com/pinojs/pino/blob/main/docs/help.md#sync-vs-async
// pino v10 takes the destination as a second positional arg, not as
// a `destination` key in the options object.
const prodDestination = isProd ? pino.destination({ sync: true }) : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    transport: !isProd
      ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
      : undefined,
  },
  prodDestination,
);
