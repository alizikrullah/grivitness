import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as workoutsController from './workouts.controller.js';
import {
  CreateCustomWorkoutSchema,
  CreateWorkoutSchema,
  LibraryQuerySchema,
  UpdateWorkoutSchema,
  WorkoutDayStatusSchema,
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
router.get('/day', validateQuery(SingleDateSchema), workoutsController.getDay);

// Rest day atau lagi sakit untuk satu tanggal; backend yang mengatur rentang sakitnya.
router.put('/day-status', validateBody(WorkoutDayStatusSchema), workoutsController.setDayStatus);

router.get('/', validateQuery(DateRangeSchema), workoutsController.getRange);
router.post('/', validateBody(CreateWorkoutSchema), workoutsController.create);

// Screenshot aplikasi jam atau lari jadi isian form. Tidak menyimpan apa pun;
// hasilnya disimpan lewat POST / biasa setelah user memeriksanya.
router.post('/scan', upload.array('images', 3), workoutsController.scan);

router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateWorkoutSchema),
  workoutsController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), workoutsController.remove);

export default router;
