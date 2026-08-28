import {
  ChatCircleDotsIcon,
  PaperPlaneRightIcon,
  SparkleIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { ConfirmDialog, ErrorNote } from '@/components/ui';
import { colors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useChatHistory, useClearChat, useSendChat } from '@/services/chat.service';
import './ChatWidget.css';

const SAPAAN = 'Tanya apa saja soal latihan, makan, atau progresmu. Aku bisa melihat catatanmu.';

const CONTOH = [
  'Gimana progres saya minggu ini?',
  'Kenapa berat naik padahal defisit?',
  'Menu sarapan tinggi protein dong',
];

/**
 * Asisten AI dalam panel mengambang.
 *
 * Dipasang di AppLayout, bukan di tiap halaman. Kalau dipasang per halaman,
 * riwayat percakapannya hilang setiap pindah menu, dan user kehilangan konteks
 * obrolan cuma karena mengecek Progres sebentar.
 */
export const ChatWidget = () => {
  const kirimAI = useSendChat();
  const hapusRiwayat = useClearChat();

  // Riwayatnya datang dari server sekarang, bukan dari state komponen. Percakapan
  // karena itu bertahan setelah tab ditutup, dan sama dengan yang di mobile.
  const riwayat = useChatHistory().data ?? [];

  const [terbuka, setTerbuka] = useState(false);
  const [teks, setTeks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tanyaHapus, setTanyaHapus] = useState(false);

  const akhir = useRef<HTMLDivElement>(null);

  // Setiap pesan baru menggulung ke bawah. Tanpa ini, balasan panjang muncul di
  // luar area terlihat dan seolah tidak ada jawaban sama sekali.
  useEffect(() => {
    if (riwayat.length > 0) akhir.current?.scrollIntoView({ behavior: 'smooth' });
  }, [riwayat.length, kirimAI.isPending]);

  const kirim = (isi: string) => {
    const bersih = isi.trim();
    if (bersih.length === 0 || kirimAI.isPending) return;

    setError(null);
    setTeks('');

    kirimAI.mutate(bersih, {
      onError: (e: unknown) => {
        setError(toApiError(e).message);

        // Pesan yang gagal dikembalikan ke kolom ketik supaya tidak perlu
        // diketik ulang. Yang menempelkannya sementara ke riwayat sudah dilepas
        // sendiri oleh onError di service.
        setTeks(bersih);
      },
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    kirim(teks);
  };

  const belumBisaKirim = teks.trim().length === 0 || kirimAI.isPending;

  return (
    <>
      {terbuka ? (
        <section className="chat-panel" aria-label="Asisten GriviTness">
          <header className="chat-head">
            <span className="chat-head-icon">
              <SparkleIcon size={18} color={colors.primary} weight="fill" />
            </span>

            <span className="flex-1">
              <span className="t-label">Asisten GriviTness</span>
              <span className="t-caption c-tertiary">Seputar kebugaran dan gizi</span>
            </span>

            {riwayat.length > 0 ? (
              <button
                type="button"
                className="chat-close"
                onClick={() => setTanyaHapus(true)}
                aria-label="Hapus riwayat percakapan"
              >
                <TrashIcon size={17} weight="regular" />
              </button>
            ) : null}

            <button
              type="button"
              className="chat-close"
              onClick={() => setTerbuka(false)}
              aria-label="Tutup"
            >
              <XIcon size={18} weight="bold" />
            </button>
          </header>

          <div className="chat-log">
            {riwayat.length === 0 ? (
              <div className="chat-kosong">
                <span className="t-body c-secondary">{SAPAAN}</span>

                {CONTOH.map((c) => (
                  <button key={c} type="button" className="chat-contoh" onClick={() => kirim(c)}>
                    <span className="t-caption c-secondary">{c}</span>
                  </button>
                ))}
              </div>
            ) : (
              riwayat.map((m, i) => (
                <div key={m.id + i} className={m.role === 'USER' ? 'chat-user' : 'chat-ai'}>
                  {m.content}
                </div>
              ))
            )}

            {kirimAI.isPending ? (
              <div className="chat-ai c-tertiary">Sedang menyusun jawaban...</div>
            ) : null}

            {error ? <ErrorNote message={error} /> : null}

            <div ref={akhir} />
          </div>

          <form className="chat-komposer" onSubmit={submit}>
            <input
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              placeholder="Tulis pertanyaan..."
              maxLength={2000}
              className="chat-input"
            />

            <button
              type="submit"
              className="chat-kirim"
              disabled={belumBisaKirim}
              aria-label="Kirim"
            >
              <PaperPlaneRightIcon size={17} weight="fill" />
            </button>
          </form>
          <ConfirmDialog
            open={tanyaHapus}
            title="Hapus riwayat percakapan?"
            message="Seluruh percakapan dengan asisten akan hilang permanen, dan dia tidak lagi ingat apa yang sudah kamu tanyakan."
            onCancel={() => setTanyaHapus(false)}
            onConfirm={() => {
              setTanyaHapus(false);
              setError(null);
              hapusRiwayat.mutate(undefined, {
                onError: (e: unknown) => setError(toApiError(e).message),
              });
            }}
          />
        </section>
      ) : null}

      <button
        type="button"
        className="chat-bubble"
        onClick={() => setTerbuka((v) => !v)}
        aria-label={terbuka ? 'Tutup asisten AI' : 'Buka asisten AI'}
        aria-expanded={terbuka}
      >
        {terbuka ? (
          <XIcon size={24} color={colors.white} weight="bold" />
        ) : (
          <ChatCircleDotsIcon size={26} color={colors.white} weight="fill" />
        )}
      </button>
    </>
  );
};
