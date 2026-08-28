import type { Request, Response } from 'express';

import { getAuthUser } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as chatService from './chat.service.js';
import type { ChatDto } from './chat.validation.js';

export const send = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await chatService.reply(user.id, (req.body as ChatDto).message));
};

export const history = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await chatService.getHistory(user.id));
};

export const clear = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req);
  sendSuccess(res, await chatService.clearHistory(user.id));
};
