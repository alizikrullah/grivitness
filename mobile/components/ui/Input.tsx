import { EyeIcon, EyeSlashIcon } from 'phosphor-react-native';
import { type ReactNode, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextStyle,
} from 'react-native';

import { colors } from '@/constants/colors';
import { fonts, radius, spacing } from '@/constants/theme';
import { Text } from './Text';

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
  maxLength?: number;
  /** Satuan yang ditempel di kanan, misalnya "kg" atau "cm". */
  suffix?: string;
  icon?: ReactNode;
  editable?: boolean;
  style?: TextStyle;
}

export const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secure = false,
  keyboardType,
  autoCapitalize = 'none',
  multiline = false,
  maxLength,
  suffix,
  icon,
  editable = true,
  style,
}: InputProps) => {
  const [fokus, setFokus] = useState(false);
  const [terlihat, setTerlihat] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          fokus && styles.focused,
          error ? styles.errored : null,
          !editable && styles.readonly,
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={secure && !terlihat}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          multiline={multiline}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setFokus(true)}
          onBlur={() => setFokus(false)}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />

        {suffix ? (
          <Text variant="label" tone="secondary">
            {suffix}
          </Text>
        ) : null}

        {secure ? (
          <Pressable onPress={() => setTerlihat((v) => !v)} hitSlop={10}>
            {terlihat ? (
              <EyeSlashIcon size={20} color={colors.textSecondary} weight="regular" />
            ) : (
              <EyeIcon size={20} color={colors.textSecondary} weight="regular" />
            )}
          </Pressable>
        ) : null}
      </View>

      {/* Pesan error menggantikan hint, bukan menumpuk di bawahnya — dua baris
          keterangan sekaligus membuat form terlihat penuh dan sulit dibaca. */}
      {error ? (
        <Text variant="caption" tone="accent">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: { minHeight: 110, alignItems: 'flex-start', paddingVertical: spacing.md },
  focused: { borderColor: colors.borderFocus, backgroundColor: colors.surface },
  errored: { borderColor: colors.primary },
  readonly: { opacity: 0.6 },
  icon: { opacity: 0.9 },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 15,
    padding: 0,
  },
  inputMultiline: { textAlignVertical: 'top', minHeight: 86 },
});
