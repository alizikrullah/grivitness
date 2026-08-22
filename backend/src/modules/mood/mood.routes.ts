import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, UuidParamSchema } from '../../utils/query.js';
import * as moodController from './mood.controller.js';
import { CreateMoodSchema, UpdateMoodSchema } from './mood.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', moodController.getToday);

router.get('/', validateQuery(DateRangeSchema), moodController.getRange);
router.post('/', validateBody(CreateMoodSchema), moodController.create);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateMoodSchema),
  moodController.update,
);

export default router;
