import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import * as usersController from './users.controller.js';
import { CreateProfileSchema, UpdateMeSchema, UpdateProfileSchema } from './users.validation.js';

const router: Router = Router();

// Seluruh endpoint di module ini butuh autentikasi, jadi middleware-nya
// dipasang sekali di sini daripada diulang di setiap baris route.
router.use(authMiddleware);

router.get('/me', usersController.getMe);
router.patch('/me', validateBody(UpdateMeSchema), usersController.updateMe);

router.get('/me/profile', usersController.getProfile);
router.post('/me/profile', validateBody(CreateProfileSchema), usersController.createProfile);
router.patch('/me/profile', validateBody(UpdateProfileSchema), usersController.updateProfile);

export default router;
