import { z } from 'zod';

/**
 * Client mengirim SATU pesan baru, bukan seluruh riwayat.
 *
 * Sebelumnya riwayatnya hidup di state klien dan dikirim ulang tiap giliran.
 * Sejak percakapan disimpan di server, cara itu jadi salah dalam dua hal:
 * membuang jaringan untuk mengirim ulang hal yang sudah ada di database, dan
 * membiarkan client menentukan sendiri isi riwayat yang dilihat model.
 */
export const ChatSchema = z.object({
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(2000),
});

export type ChatDto = z.infer<typeof ChatSchema>;
