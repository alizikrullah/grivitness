import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, SingleDateDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as moodService from './mood.service.js';
import type { CreateMoodDto, UpdateMoodDto } from './mood.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await moodService.create(user.id, req.body as CreateMoodDto), 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await moodService.getToday(user.id));
};

/**
 * Data satu tanggal, dipakai layar catat untuk menelusuri hari-hari lampau.
 *
 * Tanpa ini layar catat hanya bisa menampilkan hari ini, dan riwayat yang
 * sudah tersimpan tidak pernah bisa dibaca ulang dari aplikasi.
 */
export const getDay = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<SingleDateDto>(res);

  sendSuccess(res, await moodService.getByDate(user.id, date));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await moodService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)));
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  sendSuccess(res, await moodService.update(user.id, id, req.body as UpdateMoodDto));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await moodService.remove(user.id, id);
  sendSuccess(res, { message: 'Log mood dihapus' });
};
