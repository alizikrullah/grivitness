import { useMutation } from '@tanstack/react-query';

import { post } from '@/lib/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Percakapan tidak disimpan di server.
 *
 * Riwayatnya hidup di state komponen dan dikirim ulang setiap giliran. Untuk
 * aplikasi satu orang, menyimpannya di database berarti satu collection baru
 * yang harus dirawat hanya demi mengingat obrolan yang jarang dibaca lagi.
 *
 * Karena itu TIDAK memakai useQuery: tidak ada yang perlu di-cache, dan setiap
 * pengiriman adalah tindakan baru, bukan pembacaan ulang data yang sama.
 */
export const useSendChat = () =>
  useMutation({
    mutationFn: (messages: ChatMessage[]) => post<{ reply: string }>('/api/chat', { messages }),
  });
