import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as measurementsService from './measurements.service.js';
import type { CreateMeasurementDto, UpdateMeasurementDto } from './measurements.validation.js';

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(
    res,
    await measurementsService.create(user.id, req.body as CreateMeasurementDto),
    201,
  );
};

export const getLatest = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await measurementsService.getLatest(user.id));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(
    res,
    await measurementsService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)),
  );
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  sendSuccess(res, await measurementsService.update(user.id, id, req.body as UpdateMeasurementDto));
};
