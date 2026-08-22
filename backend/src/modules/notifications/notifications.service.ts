import { forUser } from '../../data/scoped.js';
import type { NotificationSettingsRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import type { UpdateNotificationSettingsDto } from './notifications.validation.js';

/**
 * Barisnya dibuat otomatis saat register, jadi module ini tidak perlu menangani
 * pembuatan awal. Pemeriksaan di bawah cuma pengaman kalau ada akun lama yang
 * dibuat sebelum aturan itu berlaku.
 */
export const getSettings = async (userId: string): Promise<NotificationSettingsRecord> => {
  const settings = await forUser(userId).findOne('notification_settings');

  if (!settings) {
    throw AppError.notFound('Pengaturan notifikasi tidak ditemukan');
  }

  return settings;
};

export const updateSettings = async (
  userId: string,
  data: UpdateNotificationSettingsDto,
): Promise<NotificationSettingsRecord> => {
  const repo = forUser(userId);
  const settings = await getSettings(userId);

  return repo.update('notification_settings', settings.id, data);
};
