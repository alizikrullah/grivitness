import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { AppError } from '../../utils/api-error.js';
import type { DateRangeDto, UuidParamDto } from '../../utils/query.js';
import { sendSuccess } from '../../utils/response.js';
import * as bodyPhotosService from './body-photos.service.js';
import type { CreateBodyPhotoDto } from './body-photos.validation.js';

/** Bentuk req.files saat memakai upload.fields(). */
type UploadedFields = Record<string, Express.Multer.File[] | undefined>;

export const create = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);

  const files = req.files as UploadedFields | undefined;

  const front = files?.front_photo?.[0];
  const side = files?.side_photo?.[0];

  // Keduanya wajib, tidak boleh salah satu. Analisa AI membandingkan tampak
  // depan dan samping — dengan satu foto saja hasilnya tidak sebanding dengan
  // catatan lain, dan barisnya sudah terlanjur memakai jatah hari itu.
  if (!front || !side) {
    throw AppError.badRequest(
      'Foto depan dan samping keduanya wajib, dikirim di field "front_photo" dan "side_photo"',
    );
  }

  const result = await bodyPhotosService.create(
    user.id,
    front.buffer,
    side.buffer,
    req.body as CreateBodyPhotoDto,
  );

  sendSuccess(res, result, 201);
};

export const getToday = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await bodyPhotosService.getToday(user.id));
};

export const getRange = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await bodyPhotosService.getRange(user.id, getValidatedQuery<DateRangeDto>(res)));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  const { id } = getValidatedParams<UuidParamDto>(res);

  await bodyPhotosService.remove(user.id, id);
  sendSuccess(res, { message: 'Foto badan dan filenya dihapus' });
};
