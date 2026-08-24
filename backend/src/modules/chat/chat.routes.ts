import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import * as chatController from './chat.controller.js';
import { ChatSchema } from './chat.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.post('/', validateBody(ChatSchema), chatController.send);

export default router;
