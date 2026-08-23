import { Link } from 'expo-router';
import { EnvelopeSimpleIcon, LockKeyIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button, ErrorNote, Input, Screen, Text } from '@/components/ui';
import { HeroTitle } from '@/components/ui/HeroTitle';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bisaKirim = email.trim().length > 0 && password.length > 0;

  const kirim = async () => {
    if (!bisaKirim) return;

    setLoading(true);
    setError(null);

    try {
      await login(email.trim(), password);
      // Pengalihan ke tab ditangani gerbang auth di root layout.
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
          <HeroTitle text="Mulai lagi hari ini" highlight="ini" />
          <Text variant="body" tone="secondary">
            Masuk untuk melanjutkan catatan kebugaran kamu.
          </Text>
        </View>

        <View style={styles.form}>
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
            placeholder="Password kamu"
            secure
            icon={<LockKeyIcon size={20} color={colors.textSecondary} weight="duotone" />}
          />

          {error ? <ErrorNote message={error} /> : null}

          <Button label="Masuk" onPress={kirim} loading={loading} disabled={!bisaKirim} size="lg" />
        </View>

        <View style={styles.footer}>
          <Text variant="body" tone="secondary">
            Belum punya akun?
          </Text>
          <Link href="/(auth)/register" replace>
            <Text variant="label" tone="accent">
              Daftar sekarang
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
