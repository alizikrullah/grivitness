import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import * as streaksController from './streaks.controller.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/me', streaksController.getMine);

export default router;
