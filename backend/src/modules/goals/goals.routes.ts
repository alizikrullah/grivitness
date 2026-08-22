import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import * as goalsController from './goals.controller.js';
import { CreateGoalSchema, GoalIdSchema, UpdateGoalSchema } from './goals.validation.js';

const router: Router = Router();

router.use(authMiddleware);

// Didaftarkan sebelum '/:id' supaya '/active' tidak tertangkap sebagai id.
router.get('/active', goalsController.getActive);

router.get('/', goalsController.list);
router.post('/', validateBody(CreateGoalSchema), goalsController.create);
router.patch(
  '/:id',
  validateParams(GoalIdSchema),
  validateBody(UpdateGoalSchema),
  goalsController.update,
);

export default router;
