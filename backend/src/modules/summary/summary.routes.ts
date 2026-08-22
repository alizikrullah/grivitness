import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import * as summaryController from './summary.controller.js';
import {
  DailySummarySchema,
  MonthlySummarySchema,
  WeeklySummarySchema,
} from './summary.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/daily', validateQuery(DailySummarySchema), summaryController.getDaily);
router.get('/weekly', validateQuery(WeeklySummarySchema), summaryController.getWeekly);
router.get('/monthly', validateQuery(MonthlySummarySchema), summaryController.getMonthly);

export default router;
