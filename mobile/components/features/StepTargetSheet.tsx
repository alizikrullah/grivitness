import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorNote, Sheet, Stepper, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useSaveProfile } from '@/services/users.service';

interface StepTargetSheetProps {
  /** Target yang sedang berlaku, bawaan atau pilihan user. */
  current: number;
  /** true kalau yang berlaku sekarang pilihan user, jadi tombol "kembali ke bawaan" relevan. */
  custom: boolean;
  onClose: () => void;
}

/** Bawaan backend untuk usia di bawah 60. Cuma untuk keterangan di layar. */
const BAWAAN = 8000;

/**
 * Mengubah target langkah harian.
 *
 * Langkah cuma pantauan perilaku, tidak masuk hitungan kalori, jadi targetnya
 * milik user. Orang yang tahu 6.000 itu yang realistis buat dia tidak perlu
 * melihat angka merah tiap hari karena aplikasi memaksakan 8.000.
 *
 * Disimpan di profil (step_target), dipakai backend saat menyusun target
 * harian, jadi beranda dan layar ini langsung ikut.
 */
export const StepTargetSheet = ({ current, custom, onClose }: StepTargetSheetProps) => {
  const simpan = useSaveProfile('update');
  const [nilai, setNilai] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const kirim = (target: number | null) => {
    setError(null);
    simpan.mutate(
      { step_target: target },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Target langkah harian"
      footer={
        <View style={styles.footer}>
          {custom ? (
            <Button
              label={'Kembali ke bawaan (' + BAWAAN.toLocaleString('id-ID') + ')'}
              variant="secondary"
              onPress={() => kirim(null)}
              loading={simpan.isPending}
            />
          ) : null}
          <Button
            label="Simpan target"
            onPress={() => kirim(nilai)}
            loading={simpan.isPending}
            size="lg"
          />
        </View>
      }
    >
      <View style={styles.group}>
        <Stepper
          value={nilai}
          onChange={setNilai}
          step={500}
          min={1000}
          max={40_000}
          suffix="langkah"
        />
        <Text variant="caption" tone="tertiary">
          Pilih angka yang benar-benar bisa kamu capai. Langkah dipakai untuk memantau gerak, bukan
          untuk menghitung kalori, jadi target yang jujur lebih berguna daripada target yang tinggi.
          Bawaannya 8.000, titik di mana manfaat kesehatannya mendatar menurut penelitian.
        </Text>
      </View>

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  footer: { gap: spacing.sm },
});
