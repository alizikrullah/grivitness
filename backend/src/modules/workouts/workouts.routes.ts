import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, UuidParamSchema } from '../../utils/query.js';
import * as workoutsController from './workouts.controller.js';
import {
  CreateCustomWorkoutSchema,
  CreateWorkoutSchema,
  LibraryQuerySchema,
} from './workouts.validation.js';

const router: Router = Router();

router.use(authMiddleware);

// Route dengan segmen tetap didaftarkan sebelum '/:id', supaya 'library',
// 'custom', dan 'today' tidak tertangkap sebagai id.
router.get('/library', validateQuery(LibraryQuerySchema), workoutsController.getLibrary);

router.get('/custom', workoutsController.getCustom);
router.post('/custom', validateBody(CreateCustomWorkoutSchema), workoutsController.createCustom);
router.delete('/custom/:id', validateParams(UuidParamSchema), workoutsController.removeCustom);

router.get('/today', workoutsController.getToday);

router.get('/', validateQuery(DateRangeSchema), workoutsController.getRange);
router.post('/', validateBody(CreateWorkoutSchema), workoutsController.create);

router.delete('/:id', validateParams(UuidParamSchema), workoutsController.remove);

export default router;
