import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as measurementsController from './measurements.controller.js';
import { CreateMeasurementSchema, UpdateMeasurementSchema } from './measurements.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/latest', measurementsController.getLatest);
router.get('/day', validateQuery(SingleDateSchema), measurementsController.getDay);

router.get('/', validateQuery(DateRangeSchema), measurementsController.getRange);
router.post('/', validateBody(CreateMeasurementSchema), measurementsController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateMeasurementSchema),
  measurementsController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), measurementsController.remove);

export default router;
