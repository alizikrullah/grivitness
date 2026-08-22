import { z } from 'zod';

import { dateString } from '../../utils/query.js';

export const CreateBodyPhotoSchema = z.object({
  logged_at: dateString.optional(),
});

export type CreateBodyPhotoDto = z.infer<typeof CreateBodyPhotoSchema>;
