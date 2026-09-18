import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as bodyPhotosController from './body-photos.controller.js';
import { ComparePhotosSchema, CreateBodyPhotoSchema } from './body-photos.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', bodyPhotosController.getToday);
router.get('/day', validateQuery(SingleDateSchema), bodyPhotosController.getDay);
router.get('/', validateQuery(DateRangeSchema), bodyPhotosController.getRange);

// Perbandingan dua tanggal. GET-nya deterministik dan murah (foto + pinggang
// berdampingan); POST-nya memanggil model dengan empat gambar, jadi hanya
// dipicu tombol, bukan tiap layar dibuka.
router.get('/compare', validateQuery(ComparePhotosSchema), bodyPhotosController.getComparison);
router.post('/compare', validateBody(ComparePhotosSchema), bodyPhotosController.compare);
router.get('/comparisons', bodyPhotosController.listComparisons);

router.post(
  '/',
  upload.fields([
    { name: 'front_photo', maxCount: 1 },
    { name: 'side_photo', maxCount: 1 },
  ]),
  validateBody(CreateBodyPhotoSchema),
  bodyPhotosController.create,
);

router.delete('/:id', validateParams(UuidParamSchema), bodyPhotosController.remove);

export default router;
