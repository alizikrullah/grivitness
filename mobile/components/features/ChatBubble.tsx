import * as Haptics from 'expo-haptics';
import { ChatCircleDotsIcon, PaperPlaneRightIcon, SparkleIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNote, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { elevation, radius, spacing, typography } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useSendChat, type ChatMessage } from '@/services/chat.service';

/**
 * Tinggi tab bar melayang: satu baris setinggi 48 ditambah padding 8 di atas
 * dan bawah. Gelembung harus duduk di atasnya, bukan menimpanya.
 */
const TINGGI_TAB_BAR = 64;

const SAPAAN = 'Tanya apa saja soal latihan, makan, atau progresmu. Aku bisa melihat catatanmu.';

const CONTOH = [
  'Gimana progres gua minggu ini?',
  'Kenapa berat gua naik padahal defisit?',
  'Menu sarapan tinggi protein dong',
];

/**
 * Gelembung asisten AI yang mengambang di atas tab bar.
 *
 * Dipasang sekali di layout tab, bukan di tiap layar. Kalau dipasang per layar,
 * riwayat percakapannya ikut hilang setiap pindah tab, dan user kehilangan
 * konteks obrolan cuma karena mengecek Progres sebentar.
 */
export const ChatBubble = () => {
  const insets = useSafeAreaInsets();
  const kirimAI = useSendChat();

  const [terbuka, setTerbuka] = useState(false);
  const [riwayat, setRiwayat] = useState<ChatMessage[]>([]);
  const [teks, setTeks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<ScrollView>(null);

  // Setiap pesan baru menggulung ke bawah. Tanpa ini, balasan panjang muncul di
  // luar layar dan terlihat seperti tidak ada jawaban sama sekali.
  useEffect(() => {
    if (riwayat.length > 0) scroller.current?.scrollToEnd({ animated: true });
  }, [riwayat, kirimAI.isPending]);

  const kirim = (isi: string) => {
    const bersih = isi.trim();
    if (bersih.length === 0 || kirimAI.isPending) return;

    void Haptics.selectionAsync();
    setError(null);
    setTeks('');

    const berikutnya: ChatMessage[] = [...riwayat, { role: 'user', content: bersih }];
    setRiwayat(berikutnya);

    kirimAI.mutate(berikutnya, {
      onSuccess: (hasil) => {
        setRiwayat([...berikutnya, { role: 'assistant', content: hasil.reply }]);
      },
      onError: (e) => {
        setError(toApiError(e).message);

        // Pesan yang gagal dikembalikan ke kolom ketik supaya tidak perlu
        // diketik ulang. Membiarkannya menggantung di riwayat tanpa jawaban
        // membuat giliran berikutnya membawa konteks yang timpang.
        setRiwayat(riwayat);
        setTeks(bersih);
      },
    });
  };

  const belumBisaKirim = teks.trim().length === 0 || kirimAI.isPending;

  return (
    <>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setTerbuka(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Buka asisten AI"
        style={({ pressed }) => [
          styles.bubble,
          { bottom: Math.max(insets.bottom, spacing.md) + TINGGI_TAB_BAR + spacing.md },
          pressed && styles.pressed,
        ]}
      >
        <ChatCircleDotsIcon size={26} color={colors.white} weight="fill" />
      </Pressable>

      <Modal
        visible={terbuka}
        animationType="slide"
        transparent
        onRequestClose={() => setTerbuka(false)}
      >
        <View style={styles.scrim}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <View style={styles.head}>
                <View style={styles.headIcon}>
                  <SparkleIcon size={18} color={colors.primary} weight="fill" />
                </View>

                <View style={styles.headText}>
                  <Text variant="label">Asisten GriviTness</Text>
                  <Text variant="caption" tone="tertiary">
                    Seputar kebugaran dan gizi
                  </Text>
                </View>

                <Pressable
                  onPress={() => setTerbuka(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Tutup"
                >
                  <XIcon size={20} color={colors.textSecondary} weight="bold" />
                </Pressable>
              </View>

              <ScrollView
                ref={scroller}
                style={styles.log}
                contentContainerStyle={styles.logIsi}
                keyboardShouldPersistTaps="handled"
              >
                {riwayat.length === 0 ? (
                  <View style={styles.kosong}>
                    <Text variant="body" tone="secondary">
                      {SAPAAN}
                    </Text>

                    {CONTOH.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => kirim(c)}
                        style={({ pressed }) => [styles.contoh, pressed && styles.pressed]}
                      >
                        <Text variant="caption" tone="secondary">
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  riwayat.map((m, i) => (
                    <View key={i} style={m.role === 'user' ? styles.dariUser : styles.dariAI}>
                      <Text
                        variant="body"
                        tone={m.role === 'user' ? 'inverse' : 'primary'}
                        style={styles.pesanTeks}
                      >
                        {m.content}
                      </Text>
                    </View>
                  ))
                )}

                {kirimAI.isPending ? (
                  <View style={styles.dariAI}>
                    <Text variant="body" tone="tertiary">
                      Sedang menyusun jawaban...
                    </Text>
                  </View>
                ) : null}

                {error ? <ErrorNote message={error} /> : null}
              </ScrollView>

              <View style={styles.komposer}>
                <TextInput
                  value={teks}
                  onChangeText={setTeks}
                  placeholder="Tulis pertanyaan..."
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                  multiline
                  maxLength={2000}
                />

                <Pressable
                  onPress={() => kirim(teks)}
                  disabled={belumBisaKirim}
                  accessibilityRole="button"
                  accessibilityLabel="Kirim"
                  style={({ pressed }) => [
                    styles.tombolKirim,
                    belumBisaKirim && styles.tombolMati,
                    pressed && styles.pressed,
                  ]}
                >
                  <PaperPlaneRightIcon size={18} color={colors.white} weight="fill" />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...elevation.glow,
  },
  pressed: { opacity: 0.75 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headText: { flex: 1, gap: 2 },
  log: { flexGrow: 0 },
  logIsi: { gap: spacing.sm, paddingBottom: spacing.sm },
  kosong: { gap: spacing.sm, paddingVertical: spacing.md },
  contoh: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  dariUser: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  dariAI: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  pesanTeks: { lineHeight: 21 },
  komposer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    maxHeight: 110,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
    ...typography.body,
  },
  tombolKirim: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  tombolMati: { opacity: 0.4 },
});
