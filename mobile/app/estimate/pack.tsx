// Step 3 — Pack. Mirrors web renderStepPacking(): box cards with utilization,
// split hint, shopping list, per-group packing notes, and the QuickTap strip.
import { StyleSheet, Text, View } from 'react-native';
import { QuickTap } from '../../src/components/QuickTap';
import { Callout, Card, Chip, Fine, Lede, Row, Title } from '../../src/components/ui';
import { SEED } from '../../src/data';
import { Engine } from '../../src/engine';
import { useStore } from '../../src/store';
import { colors, radius, space } from '../../src/theme';

const GROUP_HOW: Record<'padded' | 'food' | 'general', string> = {
  padded: 'own padded box, double cushioning, "fragile" on every side',
  food: 'sealed liner bag, packed away from clothes and electronics',
  general: 'folded tight, heavier items at the bottom',
};

export default function Pack() {
  const { state, report } = useStore();
  const plan = state.packing || Engine.planPacking(state.items, SEED.boxes, SEED.itemRules);
  const totalCharge = plan.boxes.reduce((sum, b) => sum + b.chargeableKg, 0);

  return (
    <View style={s.col}>
      <Title>Pack it like this</Title>
      <Lede>
        {plan.boxes.length} box{plan.boxes.length === 1 ? '' : 'es'} from our standard sizes — fragile and food items kept apart, sized so you don't pay for air.
      </Lede>

      {plan.boxes.map((b) => (
        <Card key={b.seq} style={s.box} testID={`box-${b.seq}`}>
          <Text style={s.boxT}>
            Box {b.seq} · {b.boxName} <Text style={s.dims}>{b.dimsIn.join('×')} in</Text>
          </Text>
          <Text style={s.boxM}>{b.contents.join(' · ')}</Text>
          <View style={s.util}>
            <View style={[s.utilFill, { width: `${Math.min(100, b.utilization)}%` }]} />
          </View>
          <Row>
            <Text style={s.stat}>
              Space used <Text style={s.b}>{b.utilization}%</Text>
            </Text>
            <Text style={s.stat}>
              Weight <Text style={s.b}>{b.actualKg} kg</Text>
            </Text>
            <Text style={s.stat}>
              Billed as <Text style={s.b}>{b.chargeableKg} kg</Text>
            </Text>
          </Row>
          <Fine>
            Carriers bill the larger of actual and dimensional weight (L×W×H ÷ {Engine.DIM_DIVISOR}). This box: {b.dimKg} kg dimensional.
          </Fine>
        </Card>
      ))}

      {plan.splitHint ? <Callout kind="warn">Consider splitting this shipment. {plan.splitHint}</Callout> : null}

      <Card title="Shopping list" right={<Text style={s.muted}>Billed weight {Engine.round2(totalCharge)} kg</Text>}>
        <View style={s.chips}>
          {plan.materials.boxes.map((b) => (
            <Chip key={b.label} label={`${b.n}× ${b.label}`} />
          ))}
          <Chip label={`${plan.materials.tapeRolls}× packing tape`} />
          {plan.materials.bubbleWrapRolls ? <Chip label={`${plan.materials.bubbleWrapRolls}× bubble wrap`} /> : null}
          {plan.materials.linerBags ? <Chip label={`${plan.materials.linerBags}× sealed liner bag`} /> : null}
          <Chip label={`${plan.materials.labels}× labels & "fragile" stickers`} />
        </View>
      </Card>

      <Card title="How to pack each group">
        {plan.groups.map((g) => (
          <Text key={g.key} style={s.doc}>
            • <Text style={s.b}>{g.label}</Text> ({g.weightKg} kg) — {GROUP_HOW[g.key]}
          </Text>
        ))}
        <Text style={s.doc}>• Jars get a leak-proof wrap, then a liner bag around the whole group.</Text>
        <Text style={s.doc}>• Put a contents card inside every box — it helps if customs opens it.</Text>
      </Card>

      <QuickTap stage="pack" answered={Boolean(state.reported.pack)} shipmentId={state.id} onAnswer={(verdict, story, photos) => report({ stage: 'pack', verdict, story, photos })} />

      <Fine>The plan re-computes whenever your items change. Space used is an estimate from typical densities, not a 3D fit.</Fine>
    </View>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s3 },
  box: { gap: space.s2 },
  boxT: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  dims: { fontWeight: '400', color: colors.textTertiary, fontSize: 13 },
  boxM: { fontSize: 14, color: colors.textSecondary },
  util: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceHover, overflow: 'hidden' },
  utilFill: { height: 6, backgroundColor: colors.accentFg },
  stat: { fontSize: 13, color: colors.textSecondary },
  b: { fontWeight: '600', color: colors.textPrimary },
  muted: { fontSize: 12, color: colors.textTertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  doc: { fontSize: 14, lineHeight: 22, color: colors.textPrimary },
});
