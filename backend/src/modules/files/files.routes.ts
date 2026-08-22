import { Readable } from 'node:stream';

import { Router, type Request, type Response } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { getValidatedParams, validateParams } from '../../middlewares/validate.middleware.js';
import { getAuthUser } from '../../types/index.js';
import { type UuidParamDto, UuidParamSchema } from '../../utils/query.js';
import * as filesService from './files.service.js';

const router: Router = Router();

router.use(authMiddleware);

router.get(
  '/:id',
  validateParams(UuidParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = getAuthUser(req);
    const { id } = getValidatedParams<UuidParamDto>(res);

    const file = await filesService.streamFile(user.id, id);

    res.setHeader('Content-Type', file.contentType);
    if (file.contentLength) res.setHeader('Content-Length', file.contentLength);

    // Privat: hanya boleh disimpan cache browser milik user itu sendiri, tidak
    // oleh proxy di tengah jalan. Foto ini tidak pernah berubah setelah
    // diunggah, jadi aman disimpan lama.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    // Isinya di-stream, tidak ditampung dulu di memory. Foto beberapa megabyte
    // yang dibaca banyak user sekaligus tidak boleh menumpuk di heap.
    Readable.fromWeb(file.body).pipe(res);
  },
);

export default router;
