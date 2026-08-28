import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import * as chatController from './chat.controller.js';
import { ChatSchema } from './chat.validation.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/', chatController.history);
router.post('/', validateBody(ChatSchema), chatController.send);

// Mengosongkan SELURUH percakapan, bukan satu pesan. Panel chat cuma punya satu
// percakapan berjalan, jadi menghapus per pesan akan meninggalkan tanya tanpa
// jawab yang membuat konteks giliran berikutnya timpang.
router.delete('/', chatController.clear);

export default router;
