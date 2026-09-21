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
import {
  CreateFoodSchema,
  FoodDateSchema,
  FoodSuggestionSchema,
  UpdateFoodSchema,
} from './food.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', foodController.getToday);
// Saran nama dari catatan user sendiri, untuk pelengkap otomatis di form.
router.get('/suggestions', validateQuery(FoodSuggestionSchema), foodController.suggestions);
router.get('/', validateQuery(FoodDateSchema), foodController.getByDate);

// upload.single dijalankan SEBELUM validateBody. Field non-file di request
// multipart baru tersedia di req.body setelah Multer selesai mem-parse-nya.
// Kalau request-nya JSON biasa (tanpa foto), Multer melewatkannya begitu saja
// dan body-nya sudah terisi dari parser JSON.
router.post('/', upload.single('photo'), validateBody(CreateFoodSchema), foodController.create);

// Koreksi item tanpa memanggil model lagi. Sengaja tidak menerima foto,
// mengganti foto berarti analisa ulang, dan itu pencatatan baru.
router.patch(
  '/:id',
  validateParams(UuidParamSchema),
  validateBody(UpdateFoodSchema),
  foodController.update,
);

router.delete('/:id', validateParams(UuidParamSchema), foodController.remove);

export default router;
