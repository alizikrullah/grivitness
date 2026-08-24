import { z } from 'zod';

/**
 * Riwayat percakapan dikirim ulang oleh klien setiap kali, bukan disimpan di
 * server. Untuk aplikasi satu orang, menyimpan percakapan berarti satu
 * collection baru yang harus dijaga hanya demi kenyamanan yang bisa didapat
 * dari state di sisi klien.
 *
 * Batas 20 pesan menahan biaya token: setiap pesan lama ikut dikirim ke model
 * pada SETIAP giliran, jadi percakapan yang tidak dibatasi tumbuh biayanya
 * secara kuadratik.
 */
export const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(2000),
      }),
    )
    .min(1, 'Tidak ada pesan untuk dikirim')
    .max(20),
});

export type ChatDto = z.infer<typeof ChatSchema>;
