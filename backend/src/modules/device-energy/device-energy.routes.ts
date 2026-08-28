import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { DateRangeSchema, SingleDateSchema, UuidParamSchema } from '../../utils/query.js';
import * as deviceEnergyController from './device-energy.controller.js';
import { CreateDeviceEnergySchema } from './device-energy.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/today', deviceEnergyController.getToday);
router.get('/day', validateQuery(SingleDateSchema), deviceEnergyController.getDay);

router.get('/', validateQuery(DateRangeSchema), deviceEnergyController.getRange);

// POST bersifat upsert: mencatat ulang tanggal yang sama menimpa angkanya,
// bukan menolak sebagai duplikat.
router.post('/', validateBody(CreateDeviceEnergySchema), deviceEnergyController.save);

router.delete('/:id', validateParams(UuidParamSchema), deviceEnergyController.remove);

export default router;
