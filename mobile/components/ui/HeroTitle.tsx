import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing, typography } from '@/constants/theme';
import { Text } from './Text';

interface HeroTitleProps {
  /** Kalimat judul. Kata yang ingin disorot ditulis di `highlight`. */
  text: string;
  highlight?: string;
  size?: 'display' | 'h1';
}

/**
 * Judul besar dengan satu kata di dalam pil merah.
 *
 * Ini elemen paling menonjol di referensi visual, dan alasannya jelas: sorotan
 * itu memberi satu titik fokus tanpa perlu mewarnai seluruh kalimat.
 *
 * Dibangun dari susunan View per kata, bukan dari <Text> bersarang. Latar
 * belakang pada teks bersarang tidak menerima padding di Android, sehingga
 * pilnya akan menempel ketat ke huruf dan terlihat berbeda dari iOS.
 */
export const HeroTitle = ({ text, highlight, size = 'display' }: HeroTitleProps) => {
  const gaya = typography[size];
  const kata = text.trim().split(/\s+/);
  const disorot = highlight?.trim().toLowerCase();

  return (
    <View style={styles.wrapper}>
      {kata.map((k, i) => {
        const cocok = disorot !== undefined && k.toLowerCase().replace(/[.,!?]/g, '') === disorot;

        if (!cocok) {
          return (
            <Text key={k + i} style={gaya}>
              {k}
            </Text>
          );
        }

        return (
          <View key={k + i} style={styles.pill}>
            <Text style={[gaya, styles.pillText]}>{k}</Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  pill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
  },
  pillText: { color: colors.white },
});
