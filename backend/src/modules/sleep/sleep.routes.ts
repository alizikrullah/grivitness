import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, UuidParamSchema } from '../../utils/query.js';
import * as sleepController from './sleep.controller.js';
import { CreateSleepSchema } from './sleep.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', sleepController.getToday);

router.get('/', validateQuery(DateRangeSchema), sleepController.getRange);
router.post('/', validateBody(CreateSleepSchema), sleepController.create);

router.delete('/:id', validateParams(UuidParamSchema), sleepController.remove);

export default router;
