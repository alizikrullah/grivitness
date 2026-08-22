import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import type { UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as foodService from './food.service.js';
import type { CreateFoodDto, FoodDateDto } from './food.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);

  if (!req.file) {
    throw AppError.badRequest('Foto makanan wajib dikirim di field "photo"');
  }

  const result = await foodService.create(user.id, req.file.buffer, req.body as CreateFoodDto);

  sendSuccess(res, result, 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await foodService.getToday(user.id));
};

export const getByDate = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<FoodDateDto>(res);

  sendSuccess(res, await foodService.getByDate(user.id, date ?? todayInJakarta()));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await foodService.remove(user.id, id);
  sendSuccess(res, { message: 'Log makanan dan fotonya dihapus' });
};
