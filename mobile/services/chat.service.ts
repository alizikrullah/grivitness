import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, post } from '@/lib/api';
import { qk } from '@/lib/query';

export interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  created_at: string | null;
}

/**
 * Riwayat percakapan sekarang disimpan di server, bukan di state komponen.
 *
 * Sebelumnya riwayatnya hidup selama panel terbuka lalu hilang begitu aplikasi
 * ditutup, dan seluruhnya dikirim ulang ke backend setiap giliran. Dengan
 * disimpan, percakapannya bertahan lintas perangkat dan client cukup mengirim
 * satu pesan baru.
 */
export const useChatHistory = () =>
  useQuery({
    queryKey: qk.chat,
    queryFn: () => get<ChatMessage[]>('/api/chat'),
  });

/** Penanda sementara untuk pesan yang belum punya id dari server. */
const ID_SEMENTARA = 'menunggu';

export const useSendChat = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (message: string) => post<{ reply: string }>('/api/chat', { message }),

    /**
     * Pesan user ditempelkan ke cache sebelum server menjawab.
     *
     * Balasan model bisa memakan belasan detik. Tanpa ini, pesan yang barusan
     * diketik baru muncul setelah seluruh giliran selesai, dan panelnya terlihat
     * seperti tidak menerima apa pun.
     */
    onMutate: (message: string) => {
      const sebelum = client.getQueryData<ChatMessage[]>(qk.chat) ?? [];

      client.setQueryData<ChatMessage[]>(qk.chat, [
        ...sebelum,
        { id: ID_SEMENTARA, role: 'USER', content: message, created_at: null },
      ]);

      return { sebelum };
    },

    // Gagal berarti backend tidak menyimpan apa pun, jadi tempelan tadi ikut
    // dilepas. Membiarkannya menggantung membuat riwayat di layar berbeda dari
    // yang sebenarnya tersimpan.
    onError: (_e, _v, konteks) => {
      client.setQueryData(qk.chat, konteks?.sebelum ?? []);
    },

    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.chat });
    },
  });
};

export const useClearChat = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => del('/api/chat'),
    onSuccess: () => {
      client.setQueryData<ChatMessage[]>(qk.chat, []);
      void client.invalidateQueries({ queryKey: qk.chat });
    },
  });
};
