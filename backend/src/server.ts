import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, directus: env.DIRECTUS_URL },
    `GriviTness API jalan di http://localhost:${env.PORT}`,
  );
});

/**
 * Graceful shutdown. Coolify mengirim SIGTERM saat deploy ulang, tanpa ini,
 * request yang sedang berjalan akan terputus di tengah jalan.
 */
const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Menutup server');

  server.close(() => {
    logger.info('Server tertutup dengan bersih');
    process.exit(0);
  });

  // Jaring pengaman kalau ada koneksi yang menolak menutup.
  setTimeout(() => {
    logger.error('Shutdown melewati batas waktu, memaksa keluar');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception, proses dihentikan');
  process.exit(1);
});
