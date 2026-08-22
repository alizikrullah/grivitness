import type { Request, Response } from 'express';

import { getAuthUser } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as usersService from './users.service.js';
import type { CreateProfileDto, UpdateMeDto, UpdateProfileDto } from './users.validation.js';

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await usersService.getMe(user.id));
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await usersService.updateMe(user.id, req.body as UpdateMeDto));
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await usersService.getProfile(user.id));
};

export const createProfile = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await usersService.createProfile(user.id, req.body as CreateProfileDto), 201);
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await usersService.updateProfile(user.id, req.body as UpdateProfileDto));
};
