import type { Request, Response } from 'express';

import { getValidatedParams } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as goalsService from './goals.service.js';
import type { CreateGoalDto, GoalIdDto, UpdateGoalDto } from './goals.validation.js';

export const getActive = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await goalsService.getActive(user.id));
};

export const list = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await goalsService.list(user.id));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await goalsService.create(user.id, req.body as CreateGoalDto), 201);
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<GoalIdDto>(res);

  sendSuccess(res, await goalsService.update(user.id, id, req.body as UpdateGoalDto));
};
