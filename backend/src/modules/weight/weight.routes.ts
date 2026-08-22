import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, UuidParamSchema } from '../../utils/query.js';
import * as weightController from './weight.controller.js';
import { CreateWeightSchema, UpdateWeightSchema } from './weight.validation.js';

const router: Router = Router();

router.use(authMiddleware);

// '/today' didaftarkan sebelum route ber-parameter supaya tidak tertangkap
// sebagai id.
router.get('/today', weightController.getToday);

router.get('/', validateQuery(DateRangeSchema), weightController.getRange);
router.post('/', validateBody(CreateWeightSchema), weightController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateWeightSchema),
  weightController.update,
);
router.delete('/:id', validateParams(UuidParamSchema), weightController.remove);

export default router;
