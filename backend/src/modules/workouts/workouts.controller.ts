import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as workoutsService from './workouts.service.js';
import type {
  CreateCustomWorkoutDto,
  CreateWorkoutDto,
  LibraryQueryDto,
  UpdateWorkoutDto,
} from './workouts.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await workoutsService.create(user.id, req.body as CreateWorkoutDto), 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await workoutsService.getToday(user.id));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await workoutsService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await workoutsService.remove(user.id, id);
  sendSuccess(res, { message: 'Log olahraga dihapus' });
};

export const getLibrary = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await workoutsService.getLibrary(getValidatedQuery<LibraryQueryDto>(res)));
};

export const getCustom = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await workoutsService.getCustom(user.id));
};

export const createCustom = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(
    res,
    await workoutsService.createCustom(user.id, req.body as CreateCustomWorkoutDto),
    201,
  );
};

export const removeCustom = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await workoutsService.removeCustom(user.id, id);
  sendSuccess(res, { message: 'Custom workout dihapus' });
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  sendSuccess(res, await workoutsService.update(user.id, id, req.body as UpdateWorkoutDto));
};
