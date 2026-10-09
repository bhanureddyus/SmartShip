// Wizard shell: stepper header, route context line, step body (Slot), and
// the bottom action bar with Back / Next. Mirrors web renderWizard() and
// stepGuards — the guard runs here so no step screen can skip it.
import { Slot, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui';
import { STEPS, clampStep, guardFor, navHint, stepIndex } from '../../src/journey';
import { newState, totalKg, useStore, withEngineOutputs } from '../../src/store';
import { colors, radius, space } from '../../src/theme';

export default function EstimateLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { state, update, replace } = useStore();
  const [toast, setToast] = useState<string | null>(null);

  const key = pathname.split('/').filter(Boolean).pop() || 'describe';
  const step = stepIndex(key);

  // Keep store.step in sync with the route so "Resume" lands on the right screen.
  useEffect(() => {
    if (state.step !== step) update((p) => ({ ...p, step }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (n: number) => {
    const target = clampStep(n);
    update((p) => withEngineOutputs({ ...p, step: target }));
    router.replace(`/estimate/${STEPS[target].key}`);
  };

  const back = () => {
    if (step === 0) {
      update((p) => ({ ...p, view: 'landing' }));
      router.replace('/');
      return;
    }
    go(step - 1);
  };

  const next = () => {
    const guard = guardFor(step);
    const problem = guard ? guard(state) : null;
    if (problem) {
      setToast(problem);
      return;
    }
    go(step + 1);
  };

  const startAnother = () => {
    Alert.alert('Start another estimate?', 'This clears the current draft. Your reports and quote requests are already saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start fresh',
        style: 'destructive',
        onPress: () => {
          replace({ ...newState(), view: 'wizard' });
          router.replace('/estimate/describe');
        },
      },
    ]);
  };

  const kg = totalKg(state.items);
  const routeLabel = state.dest ? `${state.origin} → ${state.dest}` : `${state.origin} → …`;
  const cta = STEPS[step].cta;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID={`step-${STEPS[step].key}`}>
      <View style={s.stepper} accessibilityRole="list">
        {STEPS.map((st, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <Pressable
              key={st.key}
              disabled={!done}
              onPress={() => go(i)}
              style={s.stepItem}
              accessibilityState={{ selected: current }}
              testID={`stepper-${st.key}`}
            >
              <View style={[s.stepDot, done && s.stepDotDone, current && s.stepDotCurrent]}>
                <Text style={[s.stepNum, (done || current) && { color: colors.buttonPrimaryFg }]}>{done ? '✓' : i + 1}</Text>
              </View>
              <Text style={[s.stepLabel, current && s.stepLabelCurrent]}>{st.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {step > 0 ? (
        <Text style={s.context} numberOfLines={1}>
          <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{routeLabel}</Text> · {state.items.length} item{state.items.length === 1 ? '' : 's'} ·{' '}
          {kg.toFixed(1)} kg · {state.segment === 'business' ? 'Small business' : 'Personal'}
        </Text>
      ) : null}

      <ScrollView style={s.body} contentContainerStyle={s.bodyInner} keyboardShouldPersistTaps="handled">
        <Slot />
      </ScrollView>

      {toast ? (
        <View style={s.toast} testID="toast">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={[s.actionbar, { paddingBottom: insets.bottom + space.s3 }]}>
        <Button label={step === 0 ? '← Home' : '← Back'} tone="ghost" onPress={back} testID="nav-back" />
        <Text style={s.hint} numberOfLines={2}>
          {navHint(state, kg)}
        </Text>
        {cta ? (
          <Button label={cta} tone="primary" onPress={next} testID="nav-next" />
        ) : (
          <Button label="Start another" onPress={startAnother} testID="nav-new" />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceBase },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.s4, paddingVertical: space.s3 },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 56 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: colors.successFg },
  stepDotCurrent: { backgroundColor: colors.buttonPrimaryBg },
  stepNum: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  stepLabel: { fontSize: 11, color: colors.textTertiary },
  stepLabelCurrent: { color: colors.textPrimary, fontWeight: '600' },
  context: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: space.s4, paddingBottom: space.s2 },
  body: { flex: 1 },
  bodyInner: { padding: space.s4, paddingBottom: space.s8, gap: space.s3 },
  actionbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingHorizontal: space.s3,
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.surfacePrimary,
  },
  hint: { flex: 1, fontSize: 12, color: colors.textTertiary, textAlign: 'center' },
  toast: {
    position: 'absolute',
    left: space.s4,
    right: space.s4,
    bottom: 96,
    backgroundColor: colors.buttonPrimaryBg,
    borderRadius: radius.md,
    padding: space.s3,
  },
  toastText: { color: colors.buttonPrimaryFg, fontSize: 14, textAlign: 'center' },
});
