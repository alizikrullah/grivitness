import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, SingleDateDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as sleepService from './sleep.service.js';
import type { CreateSleepDto, UpdateSleepDto } from './sleep.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sleepService.create(user.id, req.body as CreateSleepDto), 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sleepService.getToday(user.id));
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

  sendSuccess(res, await sleepService.getByDate(user.id, date));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sleepService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await sleepService.remove(user.id, id);
  sendSuccess(res, { message: 'Log tidur dihapus' });
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  sendSuccess(res, await sleepService.update(user.id, id, req.body as UpdateSleepDto));
};
