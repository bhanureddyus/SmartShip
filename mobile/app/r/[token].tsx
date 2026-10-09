// Receiver arrival route: ship2us://r/<token> (and /r/<token> on web).
// No chrome beyond the logo. Reads the share context, renders ReceiverFlow,
// and on success (or a used token) the read-only recap.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, getShare, postReceiverReport } from '../../src/api';
import type { ReceiverReportInput, Report, ShareContext } from '../../src/api';
import { ReceiverFlow, ReceiverRecap } from '../../src/components/ReceiverFlow';
import { Callout, Fine } from '../../src/components/ui';
import { colors, space } from '../../src/theme';

type Load = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'error'; message: string } | { kind: 'ready'; ctx: ShareContext } | { kind: 'done'; report: Report | undefined };

export default function ReceiverRoute() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = typeof raw === 'string' ? raw : '';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoad({ kind: 'invalid' });
      return;
    }
    getShare(token)
      .then((ctx) => {
        if (cancelled) return;
        setLoad(ctx.used ? { kind: 'done', report: ctx.report } : { kind: 'ready', ctx });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setLoad({ kind: 'invalid' });
        else setLoad({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (report: ReceiverReportInput) => {
    const saved = await postReceiverReport(token, report);
    setLoad({ kind: 'done', report: saved });
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Ship2US</Text>
        {load.kind === 'loading' ? <ActivityIndicator color={colors.accentFg} /> : null}
        {load.kind === 'invalid' ? <Callout kind="err">This link isn't valid — ask the sender for a fresh one.</Callout> : null}
        {load.kind === 'error' ? <Callout kind="err">{load.message}</Callout> : null}
        {load.kind === 'ready' ? <ReceiverFlow context={load.ctx} token={token} onSubmit={submit} /> : null}
        {load.kind === 'done' ? <ReceiverRecap report={load.report} /> : null}
        <View style={{ height: space.s6 }} />
        <Fine center>Community input is unverified and never changes what Ship2US estimates. Illustrative demo — not a carrier or customs service.</Fine>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceBase },
  scroll: { padding: space.s4, gap: space.s4, maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary },
});
