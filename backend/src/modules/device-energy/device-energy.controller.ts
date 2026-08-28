import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, SingleDateDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as deviceEnergyService from './device-energy.service.js';
import type { CreateDeviceEnergyDto } from './device-energy.validation.js';

export const save = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await deviceEnergyService.save(user.id, req.body as CreateDeviceEnergyDto), 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await deviceEnergyService.getToday(user.id));
};

export const getDay = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<SingleDateDto>(res);

  sendSuccess(res, await deviceEnergyService.getByDate(user.id, date));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(
    res,
    await deviceEnergyService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)),
  );
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await deviceEnergyService.remove(user.id, id);
  sendSuccess(res, { message: 'Catatan kalori perangkat dihapus' });
};
