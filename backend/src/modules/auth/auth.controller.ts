import type { Request, Response } from 'express';

import { sendSuccess } from '../../utils/response.js';
import * as authService from './auth.service.js';
import type { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.validation.js';

/**
 * Controller hanya menjembatani req dan res. Tidak ada logic, tidak ada akses data.
 * Semua aturan bisnis ada di auth.service.
 */

/** Dipakai untuk membedakan sesi mobile dan web di collection refresh_tokens. */
const userAgentOf = (req: Request): string | null => req.get('user-agent')?.slice(0, 255) ?? null;

export const register = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.register(req.body as RegisterDto, userAgentOf(req));
  sendSuccess(res, result, 201);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.login(req.body as LoginDto, userAgentOf(req));
  sendSuccess(res, result);
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refresh_token: refreshToken } = req.body as RefreshDto;
  const result = await authService.refresh(refreshToken, userAgentOf(req));
  sendSuccess(res, result);
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refresh_token: refreshToken } = req.body as LogoutDto;
  await authService.logout(refreshToken);
  sendSuccess(res, { message: 'Logout berhasil' });
};
