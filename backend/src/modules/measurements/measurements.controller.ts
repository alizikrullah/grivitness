import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import type { DateRangeDto, SingleDateDto, UuidParamDto } from '../../utils/query.js';
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

/**
 * Data satu tanggal, dipakai layar catat untuk menelusuri hari-hari lampau.
 *
 * Tanpa ini layar catat hanya bisa menampilkan hari ini, dan riwayat yang
 * sudah tersimpan tidak pernah bisa dibaca ulang dari aplikasi.
 */
export const getDay = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { date } = getValidatedQuery<SingleDateDto>(res);

  sendSuccess(res, await measurementsService.getByDate(user.id, date));
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

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await measurementsService.remove(user.id, id);
  sendSuccess(res, { message: 'Ukuran badan dihapus' });
};
