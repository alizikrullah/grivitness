import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as sleepService from './sleep.service.js';
import type { CreateSleepDto } from './sleep.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sleepService.create(user.id, req.body as CreateSleepDto), 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sleepService.getToday(user.id));
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
