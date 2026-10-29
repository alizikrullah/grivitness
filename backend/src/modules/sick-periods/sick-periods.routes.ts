import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { DateRangeSchema } from '../../utils/query.js';
import * as sickController from './sick-periods.controller.js';
import { SetSickDaySchema } from './sick-periods.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(DateRangeSchema), sickController.getRange);

// Centang "Lagi sakit" satu tanggal; backend yang mengatur rentangnya.
router.put('/day', validateBody(SetSickDaySchema), sickController.setDay);

export default router;
