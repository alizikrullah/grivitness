import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isProduction } from './config/env.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import { logger } from './utils/logger.js';
import { sendSuccess } from './utils/response.js';

export const createApp = (): Express => {
  const app = express();

  // Backend berada di belakang Cloudflare Tunnel, jadi alamat IP asli client ada
  // di header X-Forwarded-For. Tanpa ini, rate limiter melihat semua request
  // datang dari satu IP yang sama dan akan memblokir semua orang sekaligus.
  app.set('trust proxy', 1);

  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Request tanpa origin datang dari aplikasi mobile, curl, atau health check —
        // bukan browser, jadi tidak terikat aturan CORS.
        if (!origin) return callback(null, true);

        if (env.CORS_ORIGINS.length === 0 || env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} tidak diizinkan`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    pinoHttp({
      logger,
      // Health check membanjiri log tanpa memberi informasi berguna.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'ok',
      environment: env.NODE_ENV,
      uptime_seconds: Math.round(process.uptime()),
    });
  });

  app.use('/api/auth', authRoutes);

  // Wajib dipasang paling akhir, setelah semua route.
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  if (!isProduction) {
    logger.debug({ cors: env.CORS_ORIGINS }, 'Express siap');
  }

  return app;
};
