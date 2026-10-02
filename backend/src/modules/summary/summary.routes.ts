import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import * as summaryController from './summary.controller.js';
import {
  CalendarSchema,
  DailySummarySchema,
  HistorySummarySchema,
  MonthlySummarySchema,
  WeeklySummarySchema,
} from './summary.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/daily', validateQuery(DailySummarySchema), summaryController.getDaily);
router.get('/weekly', validateQuery(WeeklySummarySchema), summaryController.getWeekly);
router.get('/monthly', validateQuery(MonthlySummarySchema), summaryController.getMonthly);

// Riwayat masuk vs keluar per hari. Satu endpoint yang menarik rentangnya
// sekaligus, bukan memanggil /daily 30 kali (30 x 13 query).
router.get('/history', validateQuery(HistorySummarySchema), summaryController.getHistory);

// Tanggal yang ada datanya untuk satu layar catat, untuk titik di kalender.
router.get('/calendar', validateQuery(CalendarSchema), summaryController.getCalendar);

export default router;
