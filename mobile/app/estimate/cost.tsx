// Step 4 — Cost. Mirrors web renderStepCost(): optimisation toggle, quote
// cards (availability, breakdown, choose, request a real quote), the
// community "families paid" line per carrier, duty notes, and QuickTap.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestQuote } from '../../src/api';
import { UNVERIFIED_LABEL } from '../../src/components/InsightLine';
import { QuickTap } from '../../src/components/QuickTap';
import { Badge, Button, Callout, Card, Chip, Fine, Lede, Row, Title, money, money0 } from '../../src/components/ui';
import { SEED } from '../../src/data';
import { Engine } from '../../src/engine';
import type { CostResult, Insight, Item, OptMode, Quote } from '../../src/engine.d';
import { ruleIdsOf, useStore } from '../../src/store';
import { colors, radius, space } from '../../src/theme';
import { useInsight } from '../../src/useInsight';

const MODES: [OptMode, string][] = [
  ['cheapest', 'Cheapest'],
  ['fastest', 'Fastest'],
  ['balance', 'Best balance'],
];

interface Availability {
  ok: boolean;
  banned: string[];
}

export function availabilityFor(items: Item[]): Record<string, Availability> {
  const flags = new Set(items.flatMap((it) => SEED.itemRules.find((r) => r.id === it.ruleId)?.flags || []));
  const out: Record<string, Availability> = {};
  for (const c of SEED.carriers) {
    const banned = (c.bannedFlags || []).filter((f) => flags.has(f));
    out[c.id] = { ok: banned.length === 0, banned };
  }
  return out;
}

// "families paid $224–$238 vs our $210 estimate (3 reports)" — per carrier,
// falling back to corridor-wide samples. Null below the insight threshold.
export function costLine(insight: Insight | null, quote: Quote): string | null {
  if (!insight) return null;
  const mine = insight.costSamples.filter((c) => c.carrier === quote.name);
  const samples = mine.length >= Engine.INSIGHT_MIN_REPORTS ? mine : insight.costSamples;
  if (samples.length < Engine.INSIGHT_MIN_REPORTS) return null;
  const actuals = samples.map((c) => c.actual);
  const lo = Math.min(...actuals);
  const hi = Math.max(...actuals);
  const scope = samples === mine ? '' : ' on this corridor';
  return `families paid ${money0(lo)}–${money0(hi)}${scope} vs our ${money0(quote.total)} estimate (${samples.length} reports)`;
}

export default function Cost() {
  const { state, update, report } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [quoteFor, setQuoteFor] = useState<Quote | null>(null);
  const [email, setEmail] = useState('');
  const insight = useInsight(state.corridor, ruleIdsOf(state.items));

  const cost: CostResult =
    state.cost ||
    Engine.costQuotes((state.packing || Engine.planPacking(state.items, SEED.boxes, SEED.itemRules)).boxes, state.items, SEED.carriers, state.corridor, state.segment, SEED.itemRules);
  const av = availabilityFor(state.items);
  const availQuotes = cost.quotes.filter((q) => av[q.carrierId]?.ok);
  const best = Engine.pickBest(availQuotes.length ? availQuotes : cost.quotes, state.optMode);
  // Same rule as web: keep the user's pick unless it is unavailable, else fall back to our pick.
  const chosen = state.chosen && av[state.chosen]?.ok ? state.chosen : best ? best.carrierId : null;
  useEffect(() => {
    if (chosen !== state.chosen) update((p) => ({ ...p, chosen }));
  }, [chosen, state.chosen, update]);

  const sorted = cost.quotes.slice().sort((a, b) => {
    const ao = av[a.carrierId]?.ok;
    const bo = av[b.carrierId]?.ok;
    if (ao !== bo) return ao ? -1 : 1;
    if (best && a.carrierId === best.carrierId) return -1;
    if (best && b.carrierId === best.carrierId) return 1;
    return a.total - b.total;
  });
  const isBiz = state.segment === 'business';
  const lo = Math.min(...availQuotes.map((q) => q.total));
  const hi = Math.max(...availQuotes.map((q) => q.total));

  const sendQuoteRequest = async () => {
    if (!quoteFor) return;
    try {
      await requestQuote({
        shipmentId: state.id,
        carrierId: quoteFor.carrierId,
        carrierName: quoteFor.name,
        estTotal: quoteFor.total,
        email: email.trim(),
        corridor: state.corridor,
        segment: state.segment,
      });
    } catch (e: unknown) {
      console.warn('quote request failed (offline?)', e);
    }
    setQuoteFor(null);
    setEmail('');
    Alert.alert('Recorded', 'Demo only — nothing was sent to the carrier.');
  };

  return (
    <View style={s.col}>
      <Title>What it really costs</Title>
      <Lede>
        {availQuotes.length ? `${money0(lo)}–${money0(hi)} all-in across ${availQuotes.length} option${availQuotes.length === 1 ? '' : 's'}` : 'Options'} — shipping, packaging,
        estimated duties, insurance and handling in one number. Illustrative estimates, never live quotes.
      </Lede>

      <Row>
        {MODES.map(([k, l]) => (
          <Chip key={k} label={l} active={state.optMode === k} onPress={() => update((p) => ({ ...p, optMode: k, chosen: null }))} testID={`opt-${k}`} />
        ))}
      </Row>

      {sorted.map((q) => {
        const a = av[q.carrierId] || { ok: true, banned: [] };
        const isBest = Boolean(best && q.carrierId === best.carrierId && a.ok);
        const isChosen = chosen === q.carrierId;
        const carrier = SEED.carriers.find((c) => c.id === q.carrierId);
        const line = costLine(insight, q);
        return (
          <Card key={q.carrierId} style={[s.quote, isChosen && a.ok && s.quoteChosen, !a.ok && s.quoteOff]} testID={`quote-${q.carrierId}`}>
            <View style={s.quoteTop}>
              <View style={{ flex: 1 }}>
                <Row>
                  <Text style={s.name}>{q.name}</Text>
                  {isBest ? <Badge label="Our pick" kind="success" /> : isChosen && a.ok ? <Badge label="Selected" /> : null}
                </Row>
                <Text style={s.tier}>
                  {q.tier} · {q.daysMin}–{q.daysMax} days · {q.tracking}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.price}>{money0(q.total)}</Text>
                <Text style={s.priceD}>estimate, all-in</Text>
              </View>
            </View>
            {a.ok ? (
              <>
                <View style={s.feats}>
                  {q.customsIncluded ? <Badge label={q.customsIncluded} kind="success" /> : null}
                  {q.features.map((f) => (
                    <Badge key={f} label={f} />
                  ))}
                </View>
                <View style={s.community} testID={`cost-insight-${q.carrierId}`}>
                  <Badge label={UNVERIFIED_LABEL} kind="warning" />
                  <Text style={s.communityText}>{line || 'Be the first family to report what you paid.'}</Text>
                </View>
                <Pressable onPress={() => setOpenId(openId === q.carrierId ? null : q.carrierId)} accessibilityRole="button">
                  <Text style={s.summary}>{openId === q.carrierId ? '▾' : '▸'} See the breakdown</Text>
                </Pressable>
                {openId === q.carrierId ? (
                  <View style={s.breakdown}>
                    <Line k={`Shipping (incl. fuel ${money(q.fuel)})`} v={money(q.freight + q.fuel)} />
                    <Line k="Packaging" v={money(q.packaging)} />
                    <Line k="Estimated duties" v={money(q.duties)} />
                    {q.fees ? <Line k={isBiz ? 'Entry processing fee' : 'Fees'} v={money(q.fees)} /> : null}
                    <Line k={`Insurance (on ${money(cost.declaredTotal)} declared)`} v={money(q.insurance)} />
                    <Line k="Customs handling" v={money(q.customs)} />
                    <Line k="Total estimate" v={money(q.total)} bold />
                    <Fine>Illustrative estimate — not a live quote. Billed weight {cost.chargeableKg} kg.</Fine>
                  </View>
                ) : null}
                <Row>
                  <Button
                    label={isChosen ? '✓ Selected' : 'Choose this'}
                    tone={isChosen ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => update((p) => ({ ...p, chosen: q.carrierId }))}
                    testID={`choose-${q.carrierId}`}
                  />
                  <Button label="Request a real quote" tone="ghost" size="sm" onPress={() => setQuoteFor(q)} />
                </Row>
              </>
            ) : (
              <Callout kind="err">
                Not available for this shipment. {carrier?.banNote || 'Restricted items.'} ({a.banned.map((f) => SEED.flagInfo[f]?.label || f).join(', ')})
              </Callout>
            )}
          </Card>
        );
      })}

      {quoteFor ? (
        <Card title="Request a real quote" testID="quote-modal">
          <Text style={s.tier}>
            {quoteFor.name} · our estimate was {money(quoteFor.total)} ({quoteFor.daysMin}–{quoteFor.daysMax} days). This demo doesn't contact carriers — we record your interest so a
            pilot partner can follow up.
          </Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com (optional)" keyboardType="email-address" autoCapitalize="none" style={s.input} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button label="Cancel" tone="ghost" size="sm" onPress={() => setQuoteFor(null)} />
            <Button label="Record my request" tone="primary" size="sm" onPress={sendQuoteRequest} />
          </Row>
        </Card>
      ) : null}

      <Fine>
        How duties were estimated: {cost.dutyLines.map((d) => `${d.item} @ ${(d.rate * 100).toFixed(1)}%`).join(' · ')}. Applied to declared values; illustrative, not a customs
        determination.
      </Fine>

      <QuickTap stage="cost" answered={Boolean(state.reported.cost)} shipmentId={state.id} onAnswer={(verdict, story, photos) => report({ stage: 'cost', verdict, story, photos })} />
    </View>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={[s.lineK, bold && s.b]}>{k}</Text>
      <Text style={[s.lineV, bold && s.b]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s3 },
  quote: { gap: space.s2 },
  quoteChosen: { borderColor: colors.accentFg, borderWidth: 2 },
  quoteOff: { opacity: 0.7 },
  quoteTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  tier: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  price: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4 },
  priceD: { fontSize: 11, color: colors.textTertiary },
  feats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 },
  community: { gap: 4, paddingVertical: space.s1 },
  communityText: { fontSize: 13, color: colors.textSecondary },
  summary: { fontSize: 13, color: colors.accentFg, fontWeight: '500' },
  breakdown: { gap: 4, paddingTop: space.s1, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s2 },
  lineK: { flex: 1, fontSize: 13, color: colors.textSecondary },
  lineV: { fontSize: 13, color: colors.textPrimary },
  b: { fontWeight: '700', color: colors.textPrimary },
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
