import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { UuidParamSchema } from '../../utils/query.js';
import * as foodController from './food.controller.js';
import { CreateFoodSchema, FoodDateSchema } from './food.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', foodController.getToday);
router.get('/', validateQuery(FoodDateSchema), foodController.getByDate);

// upload.single dijalankan SEBELUM validateBody. Field non-file di request
// multipart baru tersedia di req.body setelah Multer selesai mem-parse-nya.
router.post('/', upload.single('photo'), validateBody(CreateFoodSchema), foodController.create);

router.delete('/:id', validateParams(UuidParamSchema), foodController.remove);

export default router;
