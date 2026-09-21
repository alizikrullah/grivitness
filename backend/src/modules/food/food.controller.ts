import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import type { UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as foodService from './food.service.js';
import type {
  CreateFoodDto,
  FoodDateDto,
  FoodSuggestionDto,
  UpdateFoodDto,
} from './food.validation.js';

/**
 * Foto OPSIONAL. Dengan foto request-nya multipart dan Multer mengisi req.file;
 * tanpa foto request-nya JSON biasa dan req.file kosong. Service yang
 * memutuskan apa artinya tanpa foto: setiap item wajib punya berat.
 */
export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);

  const result = await foodService.create(
    user.id,
    req.file?.buffer ?? null,
    req.body as CreateFoodDto,
  );

  sendSuccess(res, result, 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await foodService.getToday(user.id));
};

export const suggestions = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { q } = getValidatedQuery<FoodSuggestionDto>(res);

  sendSuccess(res, await foodService.suggestions(user.id, q ?? ''));
};

export const getByDate = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<FoodDateDto>(res);

  sendSuccess(res, await foodService.getByDate(user.id, date ?? todayInJakarta()));
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  sendSuccess(res, await foodService.update(user.id, id, req.body as UpdateFoodDto));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await foodService.remove(user.id, id);
  sendSuccess(res, { message: 'Log makanan dan fotonya dihapus' });
};
