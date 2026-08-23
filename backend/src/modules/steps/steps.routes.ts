import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, UuidParamSchema } from '../../utils/query.js';
import * as stepsController from './steps.controller.js';
import { CreateStepsSchema, UpdateStepsSchema } from './steps.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', stepsController.getToday);

router.get('/', validateQuery(DateRangeSchema), stepsController.getRange);
router.post('/', validateBody(CreateStepsSchema), stepsController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateStepsSchema),
  stepsController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), stepsController.remove);

export default router;
