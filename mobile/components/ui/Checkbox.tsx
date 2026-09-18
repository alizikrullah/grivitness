import * as Haptics from 'expo-haptics';
import { CheckIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { Text } from './Text';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Keterangan kecil di bawah label, untuk menjelaskan akibat dicentang. */
  hint?: string;
}

/**
 * Kotak centang untuk satu pertanyaan ya/tidak.
 *
 * Berbeda dari sepasang Chip: chip menyiratkan dua pilihan setara, sedangkan
 * kotak centang menyiratkan satu keadaan yang bawaannya mati. Untuk "sesi ini
 * terekam jam tangan?" yang kedua lebih jujur, karena kebanyakan sesi memang
 * tidak terekam dan user cukup mengabaikannya.
 *
 * Seluruh baris bisa ditekan, bukan cuma kotaknya. Kotak 22px terlalu kecil
 * untuk jari.
 */
export const Checkbox = ({ label, checked, onChange, hint }: CheckboxProps) => (
  <Pressable
    onPress={() => {
      void Haptics.selectionAsync();
      onChange(!checked);
    }}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
  >
    <View style={[styles.box, checked ? styles.boxOn : styles.boxOff]}>
      {checked ? <CheckIcon size={14} color={colors.white} weight="bold" /> : null}
    </View>

    <View style={styles.text}>
      <Text variant="label">{label}</Text>
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pressed: { opacity: 0.75 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    // Sedikit turun supaya sejajar dengan baris pertama label, bukan dengan
    // tengah blok teks yang bisa dua baris kalau ada keterangan.
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary },
  boxOff: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  text: { flex: 1, gap: 2 },
});
