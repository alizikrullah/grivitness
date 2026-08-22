import type { Request, Response } from 'express';

import { getAuthUser } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as notificationsService from './notifications.service.js';
import type { UpdateNotificationSettingsDto } from './notifications.validation.js';

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await notificationsService.getSettings(user.id));
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(
    res,
    await notificationsService.updateSettings(user.id, req.body as UpdateNotificationSettingsDto),
  );
};
