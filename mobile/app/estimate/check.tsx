// Step 2 — Check. Mirrors web renderStepEligibility(): verdict banner,
// per-item eligibility cards with a "Where this comes from" disclosure that
// holds the community InsightLine, the docs list, and the QuickTap strip.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InsightLine } from '../../src/components/InsightLine';
import { QuickTap } from '../../src/components/QuickTap';
import { Badge, Callout, Card, Chip, Fine, Lede, Title, money } from '../../src/components/ui';
import { SEED } from '../../src/data';
import { Engine } from '../../src/engine';
import type { Eligibility, Item, Restriction } from '../../src/engine.d';
import { ruleIdsOf, useStore } from '../../src/store';
import { colors, radius, space } from '../../src/theme';
import { useInsight } from '../../src/useInsight';

const RANK: Record<Restriction, number> = { ok: 0, caution: 1, restricted: 2 };
const BADGE: Record<Restriction, 'success' | 'warning' | 'error'> = { ok: 'success', caution: 'warning', restricted: 'error' };

interface Evaluated {
  it: Item;
  el: Eligibility;
}

export function worstOf(evals: Evaluated[]): Restriction {
  return evals.reduce<Restriction>((w, e) => (RANK[e.el.restriction] > RANK[w] ? e.el.restriction : w), 'ok');
}

export function headlineFor(worst: Restriction, evals: Evaluated[]): [string, string] {
  const n = evals.filter((e) => e.el.restriction !== 'ok').length;
  const r = evals.filter((e) => e.el.restriction === 'restricted').length;
  if (worst === 'ok') return ['Looks good to ship', 'Nothing in your list is likely to need a second look.'];
  if (worst === 'caution') return [`${n} item${n === 1 ? '' : 's'} may get a second look`, 'Usually fine with the right paperwork. Details below.'];
  return [`${r} item${r === 1 ? '' : 's'} often restricted`, 'It may be refused at the border. Read the note, then decide — you can still continue.'];
}

export default function Check() {
  const { state, report } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isBiz = state.segment === 'business';
  const rules = SEED.itemRules;
  const evals: Evaluated[] = state.items
    .map((it) => ({ it, el: Engine.eligibilityFor(it, rules, state.segment) }))
    .sort((a, b) => RANK[b.el.restriction] - RANK[a.el.restriction]);
  const worst = worstOf(evals);
  const [h1, h2] = headlineFor(worst, evals);
  const allDocs = [...new Set(evals.flatMap((e) => e.el.docs || []))];
  const insight = useInsight(state.corridor, ruleIdsOf(state.items));

  return (
    <View style={s.col}>
      <Title>Can I ship this?</Title>
      <Lede>{isBiz ? 'Viewed as a commercial import — formal entry, documented values, product rules.' : 'Viewed as a personal shipment — gift and household framing.'}</Lede>

      <View style={[s.verdict, worst === 'ok' ? s.verdictOk : worst === 'caution' ? s.verdictWarn : s.verdictErr]} testID={`verdict-${worst}`}>
        <Text style={s.verdictT}>{h1}</Text>
        <Text style={s.verdictS}>{h2}</Text>
      </View>

      <Callout kind="info">
        {isBiz
          ? 'Commercial framing: expect a formal entry with duties and a processing fee. Some products need FDA or other registrations — the cost step includes an illustrative fee.'
          : 'Personal framing: gifts and household goods often clear with light paperwork. The US has a personal exemption for gifts (commonly cited near $800 per person — illustrative; policy changes, so verify before shipping).'}
      </Callout>

      {evals.map(({ it, el }) => {
        const rl = SEED.restrictionLevels[el.restriction] || SEED.restrictionLevels.caution;
        const isOpen = Boolean(open[it.uid]);
        return (
          <Card key={it.uid} style={s.elig}>
            <View style={s.eligTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{it.desc}</Text>
                <Text style={s.meta}>
                  {it.qty} {it.unit} · {it.weightKg} kg · {money(it.valueUsd)}
                </Text>
              </View>
              <Badge label={rl.label} kind={BADGE[el.restriction]} />
            </View>
            <Text style={s.note}>{el.note}</Text>
            {el.flags.length ? (
              <View style={s.flags}>
                {el.flags.map((f) => {
                  const fi = SEED.flagInfo[f];
                  return fi ? <Chip key={f} label={fi.label} warn /> : null;
                })}
              </View>
            ) : null}
            <Pressable onPress={() => setOpen((o) => ({ ...o, [it.uid]: !isOpen }))} style={s.summary} accessibilityRole="button" testID={`source-${it.uid}`}>
              <Text style={s.summaryText}>{isOpen ? '▾' : '▸'} Where this comes from</Text>
            </Pressable>
            {isOpen ? (
              <View style={s.details}>
                <Detail k="Category" v={el.category} />
                <Detail k="Code" v={el.hts} />
                <Detail k="Est. duty" v={el.dutyRate == null ? '—' : (el.dutyRate * 100).toFixed(1) + '%'} />
                {el.source ? <Detail k="Source" v={`${el.source}${el.effectiveDate ? ` · effective ${el.effectiveDate}` : ''}`} /> : null}
                {el.confidence ? <Detail k="Confidence" v={el.confidence} /> : null}
                <Detail k="Status" v="Illustrative — not a customs determination" muted />
                <InsightLine insight={it.ruleId ? insight?.rules[it.ruleId] : null} variant="check" />
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card title="Have these ready">
        {allDocs.map((d) => (
          <Text key={d} style={s.doc}>
            • {d}
          </Text>
        ))}
      </Card>

      <QuickTap stage="check" answered={Boolean(state.reported.check)} shipmentId={state.id} onAnswer={(verdict, story, photos) => report({ stage: 'check', verdict, story, photos })} />

      <Fine>Sources named are the kinds of agencies that govern these rules; this prototype does not redistribute their text. Every estimate is illustrative and non-binding.</Fine>
    </View>
  );
}

function Detail({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.dt}>{k}</Text>
      <Text style={[s.dd, muted && { color: colors.textTertiary, fontWeight: '400' }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s3 },
  verdict: { borderRadius: radius.lg, padding: space.s4, gap: 2 },
  verdictOk: { backgroundColor: colors.successBg },
  verdictWarn: { backgroundColor: colors.warningBg },
  verdictErr: { backgroundColor: colors.errorBg },
  verdictT: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  verdictS: { fontSize: 14, color: colors.textSecondary },
  elig: { gap: space.s2 },
  eligTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary },
  note: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  summary: { paddingVertical: space.s1 },
  summaryText: { fontSize: 13, color: colors.accentFg, fontWeight: '500' },
  details: { gap: space.s1, paddingTop: space.s1, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  detailRow: { flexDirection: 'row', gap: space.s2 },
  dt: { width: 92, fontSize: 13, color: colors.textTertiary },
  dd: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  doc: { fontSize: 14, lineHeight: 22, color: colors.textPrimary },
});
