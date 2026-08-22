import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import * as notificationsController from './notifications.controller.js';
import { UpdateNotificationSettingsSchema } from './notifications.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/settings', notificationsController.getSettings);
router.patch(
  '/settings',
  validateBody(UpdateNotificationSettingsSchema),
  notificationsController.updateSettings,
);

export default router;
