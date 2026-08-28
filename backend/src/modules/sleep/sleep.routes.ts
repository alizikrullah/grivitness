import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as sleepController from './sleep.controller.js';
import { CreateSleepSchema, UpdateSleepSchema } from './sleep.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', sleepController.getToday);
router.get('/day', validateQuery(SingleDateSchema), sleepController.getDay);

router.get('/', validateQuery(DateRangeSchema), sleepController.getRange);
router.post('/', validateBody(CreateSleepSchema), sleepController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateSleepSchema),
  sleepController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), sleepController.remove);

export default router;
