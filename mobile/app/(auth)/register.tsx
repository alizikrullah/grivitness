import { Link } from 'expo-router';
import { EnvelopeSimpleIcon, LockKeyIcon, UserIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button, ErrorNote, Input, Screen, Text } from '@/components/ui';
import { HeroTitle } from '@/components/ui/HeroTitle';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

/** Sama dengan batas di backend: bcrypt hanya membaca 72 byte pertama. */
const PANJANG_MIN = 8;

export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordPendek = password.length > 0 && password.length < PANJANG_MIN;
  const bisaKirim =
    name.trim().length >= 2 && email.trim().length > 0 && password.length >= PANJANG_MIN;

  const kirim = async () => {
    if (!bisaKirim) return;

    setLoading(true);
    setError(null);

    try {
      await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={styles.content}>
        <View style={styles.hero}>
          <Text variant="overline" tone="accent">
            GriviTness
          </Text>
          <HeroTitle text="Bikin badan lebih kuat" highlight="kuat" />
          <Text variant="body" tone="secondary">
            Satu akun untuk mencatat berat, makan, olahraga, dan tidur.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Nama"
            value={name}
            onChangeText={setName}
            placeholder="Nama kamu"
            autoCapitalize="words"
            icon={<UserIcon size={20} color={colors.textSecondary} weight="duotone" />}
          />

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nama@email.com"
            keyboardType="email-address"
            icon={<EnvelopeSimpleIcon size={20} color={colors.textSecondary} weight="duotone" />}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimal 8 karakter"
            secure
            error={passwordPendek ? 'Password minimal 8 karakter' : null}
            hint="Minimal 8 karakter"
            icon={<LockKeyIcon size={20} color={colors.textSecondary} weight="duotone" />}
          />

          {error ? <ErrorNote message={error} /> : null}

          <Button
            label="Buat akun"
            onPress={kirim}
            loading={loading}
            disabled={!bisaKirim}
            size="lg"
          />
        </View>

        <View style={styles.footer}>
          <Text variant="body" tone="secondary">
            Sudah punya akun?
          </Text>
          <Link href="/(auth)/login" replace>
            <Text variant="label" tone="accent">
              Masuk
            </Text>
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  hero: { gap: spacing.md },
  form: { gap: spacing.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
});
