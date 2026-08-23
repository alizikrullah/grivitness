import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as waterController from './water.controller.js';
import { CreateWaterSchema, UpdateWaterSchema } from './water.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', waterController.getToday);

router.get('/', validateQuery(SingleDateSchema), waterController.getByDate);
router.post('/', validateBody(CreateWaterSchema), waterController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateWaterSchema),
  waterController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), waterController.remove);

export default router;
