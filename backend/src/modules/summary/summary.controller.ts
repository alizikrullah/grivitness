import type { Request, Response } from 'express';

import { getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { sendSuccess } from '../../utils/response.js';
import * as summaryService from './summary.service.js';
import type { DailySummaryDto, MonthlySummaryDto, WeeklySummaryDto } from './summary.validation.js';

export const getDaily = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<DailySummaryDto>(res);

  sendSuccess(res, await summaryService.getDaily(user.id, date ?? todayInJakarta()));
};

export const getWeekly = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { from } = getValidatedQuery<WeeklySummaryDto>(res);

  sendSuccess(res, await summaryService.getWeekly(user.id, from));
};

export const getMonthly = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { year, month } = getValidatedQuery<MonthlySummaryDto>(res);

  sendSuccess(res, await summaryService.getMonthly(user.id, year, month));
};
