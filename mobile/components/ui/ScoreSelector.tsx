import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { SCORE_LABEL } from '@/constants/labels';
import { spacing } from '@/constants/theme';
import { Text } from './Text';

interface ScoreSelectorProps {
  value: number | null;
  onChange: (value: number) => void;
  /** Menentukan keterangan yang muncul di bawah pilihan. */
  kind: 'mood' | 'energy' | 'sleep';
  color?: string;
}

/**
 * Pemilih skala 1-5 untuk mood, energi, dan kualitas tidur.
 *
 * Angka dipakai alih-alih emoji supaya artinya tidak bergantung pada tafsir
 * tiap orang terhadap wajah tertentu. Keterangan tekstual muncul di bawah agar
 * user tahu persis apa yang dia pilih.
 */
export const ScoreSelector = ({
  value,
  onChange,
  kind,
  color = colors.primary,
}: ScoreSelectorProps) => (
  <View style={styles.wrapper}>
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((skor) => {
        const aktif = value === skor;

        return (
          <Pressable
            key={skor}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(skor);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={SCORE_LABEL[kind][skor]}
            style={({ pressed }) => [
              styles.dot,
              aktif ? { backgroundColor: color, borderColor: color } : styles.dotIdle,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="h3" tone={aktif ? 'inverse' : 'secondary'}>
              {skor}
            </Text>
          </Pressable>
        );
      })}
    </View>

    <Text variant="caption" tone={value === null ? 'tertiary' : 'primary'} align="center">
      {value === null ? 'Pilih salah satu' : SCORE_LABEL[kind][value]}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  dot: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 62,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dotIdle: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
