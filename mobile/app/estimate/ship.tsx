// Step 5 — Ship. Mirrors web renderStepShip(): summary stats, checklist,
// declaration draft, then the sender hand-over report (carrier chips, what
// you paid, smooth/hiccup, story, photos) which on success becomes the
// ShareCard for the receiver link.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createShare } from '../../src/api';
import type { Outcome } from '../../src/api';
import { PhotoPicker } from '../../src/components/PhotoPicker';
import { ShareCard } from '../../src/components/ShareCard';
import { Badge, Button, Callout, Card, Chip, Fine, Lede, Row, Title, money, money0 } from '../../src/components/ui';
import { SEED } from '../../src/data';
import { Engine } from '../../src/engine';
import type { Quote } from '../../src/engine.d';
import { SENDER_NAME_KEY, totalKg, useStore } from '../../src/store';
import { colors, radius, space } from '../../src/theme';

export function prepItemsFor(items: typeof SEED.demo.items, segment: 'consumer' | 'business'): string[] {
  const rules = SEED.itemRules;
  const flagsOf = (it: (typeof items)[number]) => rules.find((r) => r.id === it.ruleId)?.flags || [];
  const allDocs = [...new Set(items.flatMap((it) => Engine.eligibilityFor(it, rules, segment).docs || []))];
  return [
    'Print 2 copies of the itemized invoice — one goes inside box 1',
    ...allDocs,
    items.some((i) => flagsOf(i).includes('food')) ? "Put the recipient's phone and email on the invoice (FDA prior notice uses them)" : null,
    items.some((i) => flagsOf(i).includes('batteries')) ? 'Attach the lithium-battery handling label (if batteries are included)' : null,
    'Stick the shipping label on firmly and tape over its edges',
    segment === 'business' ? 'Keep invoice values consistent with your books' : "Sign the gift statement if you're claiming gift treatment",
  ].filter((x): x is string => Boolean(x));
}

export default function Ship() {
  const { state, update, report } = useStore();
  const cost =
    state.cost || Engine.costQuotes((state.packing || Engine.planPacking(state.items, SEED.boxes, SEED.itemRules)).boxes, state.items, SEED.carriers, state.corridor, state.segment, SEED.itemRules);
  const chosen: Quote = cost.quotes.find((q) => q.carrierId === state.chosen) || Engine.pickBest(cost.quotes, state.optMode) || cost.quotes[0];
  const boxes = state.packing ? state.packing.boxes : [];
  const prepItems = prepItemsFor(state.items, state.segment);
  const allKeys = boxes.map((b) => 'box' + b.seq).concat(['mats'], prepItems.map((_, i) => 'prep' + i));
  const doneCount = allKeys.filter((k) => state.checklist[k]).length;
  const pct = allKeys.length ? Math.round((doneCount / allKeys.length) * 100) : 0;

  // hand-over report form
  const [carrier, setCarrier] = useState<string>(chosen.name);
  const [actual, setActual] = useState<string>('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [story, setStory] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SENDER_NAME_KEY)
      .then((v) => v && setSenderName(v))
      .catch((e: unknown) => console.warn('sender name unavailable', e));
  }, []);

  const toggle = (key: string) => update((p) => ({ ...p, checklist: { ...p.checklist, [key]: !p.checklist[key] } }));

  const ensureShare = async (name: string) => {
    try {
      const r = await createShare(state.id, name.trim() || undefined);
      update((p) => ({ ...p, share: { token: r.token, url: r.url } }));
      setShareError(null);
    } catch (e: unknown) {
      console.warn('share link failed', e);
      setShareError("Couldn't create the share link — check your connection and try again.");
    }
  };

  const send = async () => {
    if (sending || pending > 0) return;
    setSending(true);
    await report({
      stage: 'ship',
      carrier,
      estimatedCost: Engine.round2(chosen.total),
      actualCost: actual.trim() ? Engine.round2(parseFloat(actual) || 0) : undefined,
      outcome: outcome || undefined,
      story: story.trim() || undefined,
      photos: photos.length ? photos : undefined,
    });
    await ensureShare(senderName);
    setSending(false);
  };

  const onNameChange = (name: string) => {
    setSenderName(name);
    AsyncStorage.setItem(SENDER_NAME_KEY, name).catch((e: unknown) => console.warn('sender name not saved', e));
  };

  return (
    <View style={s.col}>
      <Title>You're ready to ship</Title>
      <Lede>Everything you need for hand-over. Tick things off as you go — progress saves.</Lede>

      <View style={s.summary}>
        <Stat v={money0(chosen.total)} k={`est. with ${chosen.name.split(' ')[0]}`} />
        <Stat v={`${chosen.daysMin}–${chosen.daysMax} days`} k="estimated transit" />
        <Stat v={`${boxes.length} box${boxes.length === 1 ? '' : 'es'}`} k={`${totalKg(state.items).toFixed(1)} kg · ${state.items.length} items`} />
      </View>

      <Card title="Checklist" right={<Text style={s.muted}>{doneCount}/{allKeys.length} done</Text>}>
        <View style={s.progress}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.eyebrow}>Packing</Text>
        {boxes.map((b) => (
          <Check key={b.seq} k={'box' + b.seq} on={Boolean(state.checklist['box' + b.seq])} onPress={toggle}>
            <Text style={s.b}>Box {b.seq}</Text> ({b.boxName}): {b.contents.join(' · ')} — seal, label, contents card inside
          </Check>
        ))}
        <Check k="mats" on={Boolean(state.checklist.mats)} onPress={toggle}>
          Materials on hand: tape, cushioning, liner bags, labels
        </Check>
        <Text style={s.eyebrow}>Paperwork</Text>
        {prepItems.map((p, i) => (
          <Check key={i} k={'prep' + i} on={Boolean(state.checklist['prep' + i])} onPress={toggle}>
            {p}
          </Check>
        ))}
      </Card>

      <Card title="Declaration draft" right={<Badge label="review before filing" />}>
        {state.items.map((it) => {
          const r = SEED.itemRules.find((x) => x.id === it.ruleId);
          return (
            <View key={it.uid} style={s.declRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.declName}>{it.desc}</Text>
                <Text style={s.muted}>{r ? r.name : 'Uncategorized'} · {r ? r.hts : '—'}</Text>
              </View>
              <Text style={s.declNum}>
                {it.qty} {it.unit}
              </Text>
              <Text style={s.declNum}>{money(it.valueUsd)}</Text>
            </View>
          );
        })}
        <View style={[s.declRow, { borderTopWidth: 1, borderTopColor: colors.borderDefault }]}>
          <Text style={[s.declName, s.b, { flex: 1 }]}>Totals</Text>
          <Text style={[s.declNum, s.b]}>{money(cost.declaredTotal)}</Text>
          <Text style={[s.declNum, s.muted]}>duties ~{money(cost.duties)}</Text>
        </View>
        <Fine>Draft only. Values must be honest — under-declaring is a violation.</Fine>
      </Card>

      {state.reported.ship ? (
        <Card title="Let whoever's receiving this tell us it arrived" testID="share-section">
          <Callout kind="ok">Thanks — recorded as unverified community input.</Callout>
          {state.share ? (
            <ShareCard url={state.share.url} senderName={senderName} onNameChange={onNameChange} />
          ) : (
            <View style={{ gap: space.s2 }}>
              <Text style={s.muted}>{shareError || 'Creating your share link…'}</Text>
              {shareError ? <Button label="Try again" size="sm" onPress={() => ensureShare(senderName)} /> : null}
            </View>
          )}
        </Card>
      ) : (
        <Card title="How did hand-over go?" testID="handover-report">
          <Text style={s.muted}>Four taps and a line. It shows in admin as unverified community input, kept apart from seeded data.</Text>
          <Text style={s.eyebrow}>Carrier</Text>
          <View style={s.chips}>
            {cost.quotes.map((q) => (
              <Chip key={q.carrierId} label={q.name} active={carrier === q.name} onPress={() => setCarrier(q.name)} />
            ))}
            <Chip label="Other" active={carrier === 'Other'} onPress={() => setCarrier('Other')} />
          </View>
          <Text style={s.eyebrow}>What you paid ($) — our estimate was {money0(chosen.total)}</Text>
          <TextInput value={actual} onChangeText={setActual} placeholder={String(Math.round(chosen.total))} keyboardType="decimal-pad" style={s.input} testID="actual-cost" />
          <View style={s.chips}>
            <Chip label="Went smoothly" active={outcome === 'smooth'} onPress={() => setOutcome('smooth')} testID="outcome-smooth" />
            <Chip label="Had a hiccup" active={outcome === 'hiccup'} onPress={() => setOutcome('hiccup')} testID="outcome-hiccup" />
          </View>
          <TextInput value={story} onChangeText={(t) => setStory(t.slice(0, 280))} placeholder="One line for the next family (optional)" maxLength={280} style={s.input} />
          <PhotoPicker max={4} target={{ kind: 'shipment', shipmentId: state.id, role: 'sender' }} onChange={setPhotos} onPending={setPending} />
          <Text style={s.eyebrow}>Your first name (optional — the receiver sees it)</Text>
          <TextInput value={senderName} onChangeText={onNameChange} placeholder="e.g. Bhanu" maxLength={24} style={s.input} testID="sender-name" />
          <Button label={sending ? 'Sending…' : pending > 0 ? `Uploading ${pending} photo…` : 'Send'} tone="primary" onPress={send} disabled={sending || pending > 0} testID="handover-send" />
        </Card>
      )}
    </View>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statV}>{v}</Text>
      <Text style={s.statK}>{k}</Text>
    </View>
  );
}

function Check({ k, on, onPress, children }: { k: string; on: boolean; onPress: (k: string) => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={() => onPress(k)} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`check-${k}`}>
      <View style={[s.checkBox, on && s.checkBoxOn]}>{on ? <Text style={s.checkMark}>✓</Text> : null}</View>
      <Text style={[s.checkText, on && s.checkDone]}>{children}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s3 },
  summary: { flexDirection: 'row', gap: space.s2 },
  stat: { flex: 1, backgroundColor: colors.surfacePrimary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: space.s3 },
  statV: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  statK: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  muted: { fontSize: 12, color: colors.textTertiary },
  b: { fontWeight: '600', color: colors.textPrimary },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary, marginTop: space.s2 },
  progress: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceHover, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.successFg },
  check: { flexDirection: 'row', gap: space.s2, paddingVertical: space.s2, alignItems: 'flex-start' },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderDefault, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: colors.successFg, borderColor: colors.successFg },
  checkMark: { color: colors.buttonPrimaryFg, fontSize: 12, fontWeight: '700' },
  checkText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  checkDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  declRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingVertical: space.s2 },
  declName: { fontSize: 14, color: colors.textPrimary },
  declNum: { fontSize: 13, color: colors.textSecondary, minWidth: 56, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfacePrimary,
  },
});
