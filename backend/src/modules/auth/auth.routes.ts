import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validateBody } from '../../middlewares/validate.middleware.js';
import { sendError } from '../../utils/response.js';
import * as authController from './auth.controller.js';
import {
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
} from './auth.validation.js';

/**
 * Route auth. Sesuai CLAUDE.md section 4, file ini hanya berisi definisi route
 * dan middleware — tidak ada logic apa pun.
 */

const router: Router = Router();

/**
 * Endpoint auth adalah sasaran utama brute force, jadi dibatasi lebih ketat
 * daripada endpoint lain. Register dan login dibatasi per alamat IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      429,
      'RATE_LIMITED',
      'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
    );
  },
});

/**
 * Refresh dibatasi lebih longgar. Client memanggilnya secara wajar setiap kali
 * access token kedaluwarsa, dan batas yang terlalu ketat akan menendang user
 * yang sedang aktif memakai aplikasi.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
  },
});

router.post('/register', authLimiter, validateBody(RegisterSchema), authController.register);
router.post('/login', authLimiter, validateBody(LoginSchema), authController.login);
router.post('/refresh', refreshLimiter, validateBody(RefreshSchema), authController.refresh);
router.post('/logout', validateBody(LogoutSchema), authController.logout);

export default router;
