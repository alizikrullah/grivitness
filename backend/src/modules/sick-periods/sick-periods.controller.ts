import type { Request, Response } from 'express';

import { getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as sickService from './sick-periods.service.js';
import type { SetSickDayDto } from './sick-periods.validation.js';

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sickService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)));
};

export const setDay = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await sickService.setDay(user.id, req.body as SetSickDayDto));
};
