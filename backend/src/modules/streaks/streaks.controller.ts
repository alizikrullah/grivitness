import type { Request, Response } from 'express';

import { getAuthUser } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as streaksService from './streaks.service.js';

export const getMine = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await streaksService.getMine(user.id));
};
