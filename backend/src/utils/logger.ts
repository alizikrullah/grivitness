import { pino } from 'pino';

import { env, isProduction } from '../config/env.js';

/**
 * Logger tunggal aplikasi. CLAUDE.md section 15 melarang console.log — pakai ini.
 *
 * Development: output berwarna dan mudah dibaca lewat pino-pretty.
 * Production : JSON satu baris per entri, siap dibaca agregator log di Coolify.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProduction ? 'info' : 'debug',

  // Jangan sampai kredensial bocor ke log.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'password_hash',
      'token',
      'access_token',
      'refresh_token',
      '*.password',
      '*.password_hash',
      '*.refresh_token',
    ],
    censor: '[disensor]',
  },

  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});
