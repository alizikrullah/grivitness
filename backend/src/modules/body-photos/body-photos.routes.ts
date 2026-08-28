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
import { CreateBodyPhotoSchema } from './body-photos.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', bodyPhotosController.getToday);
router.get('/day', validateQuery(SingleDateSchema), bodyPhotosController.getDay);
router.get('/', validateQuery(DateRangeSchema), bodyPhotosController.getRange);

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
