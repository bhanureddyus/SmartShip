// Step 1 — Describe. Mirrors web renderStepDescribe(): segment toggle,
// narrative parse, simulated photo suggestions (pending → confirm/dismiss),
// manual items with an inline editor, and route pickers.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Callout, Card, Chip, Fine, Lede, Row, Title, money } from '../../src/components/ui';
import { SEED } from '../../src/data';
import { Engine } from '../../src/engine';
import type { Item } from '../../src/engine.d';
import { titleCase } from '../../src/journey';
import { useStore } from '../../src/store';
import { colors, radius, space } from '../../src/theme';

const UNITS = ['piece', 'kg', 'jar', 'box', 'pack', 'l'];

// Same deterministic "scan" as web: a hash of the file name picks pool entries.
export function simulatedPicks(names: string[]): Item[] {
  const picks: (typeof SEED.photoPool)[number][] = [];
  for (const name of names) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
    picks.push(SEED.photoPool[h % SEED.photoPool.length]);
    picks.push(SEED.photoPool[(h + 3) % SEED.photoPool.length]);
  }
  const uniq = picks.filter((p, i) => picks.findIndex((q) => q.desc === p.desc) === i).slice(0, 4);
  return uniq.map((p) => ({ ...Engine.makeItem(p.desc, p.qty, p.unit, p.weightKg, Engine.matchRule(p.desc), 'ai-simulated'), source: 'ai-simulated' }));
}

export default function Describe() {
  const { state, update } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [parseNote, setParseNote] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const rules = SEED.itemRules;

  const runParse = () => {
    const parsed = Engine.parseNarrative(state.narrative);
    const notes: string[] = [];
    update((p) => {
      const next = { ...p };
      if (parsed.route) {
        next.origin = titleCase(parsed.route.origin) || p.origin;
        next.originCountry = parsed.route.originCountry;
        next.corridor = parsed.route.corridor;
        next.dest = titleCase(parsed.route.dest) || p.dest;
        notes.push(`Route set to ${next.origin} → ${next.dest}.`);
      }
      if (parsed.items.length) {
        next.items = p.items.concat(parsed.items);
        next.narrative = '';
        notes.push(`Added ${parsed.items.length} item${parsed.items.length === 1 ? '' : 's'}. Weights and values are estimates — tap any item to fix it.`);
      }
      return next;
    });
    if (parsed.unknown.length) notes.push(`Couldn't read "${parsed.unknown.join(', ')}" — add it by hand. No guesses went into your list.`);
    if (!parsed.items.length && !parsed.route) notes.push('Nothing matched. Try "3 kg of snacks and 2 t-shirts", or add items by hand.');
    setParseNote(notes);
  };

  const simulateScan = () => {
    if (scanning) return;
    setScanning(true);
    const name = `photo-${Date.now()}.jpg`;
    setTimeout(() => {
      update((p) => ({ ...p, photoNames: p.photoNames.concat(name).slice(0, 3), pending: p.pending.concat(simulatedPicks([name])) }));
      setScanning(false);
    }, 1400);
  };

  const addManual = () => {
    const it = Engine.makeItem('New item', 1, 'piece', 0.5, null, 'manual');
    update((p) => ({ ...p, items: p.items.concat(it) }));
    setEditing(it.uid);
  };

  const patchItem = (uid: string, patch: Partial<Item>) => update((p) => ({ ...p, items: p.items.map((i) => (i.uid === uid ? { ...i, ...patch } : i)) }));
  const removeItem = (uid: string) => {
    update((p) => ({ ...p, items: p.items.filter((i) => i.uid !== uid) }));
    setEditing(null);
  };
  const confirmPending = (uid: string) =>
    update((p) => {
      const it = p.pending.find((x) => x.uid === uid);
      return it ? { ...p, pending: p.pending.filter((x) => x.uid !== uid), items: p.items.concat({ ...it, source: 'ai-confirmed' }) } : p;
    });
  const dismissPending = (uid: string) => update((p) => ({ ...p, pending: p.pending.filter((x) => x.uid !== uid) }));

  const originCountry = SEED.meta.originCountries.find((c) => c.id === state.originCountry) || SEED.meta.originCountries[0];

  return (
    <View style={s.col}>
      <Title>What's in the box?</Title>
      <Lede>Tell us in a sentence, or add items one by one. We'll check what's allowed, plan the packing, and estimate the cost.</Lede>

      <Row>
        <Chip label="Personal" active={state.segment === 'consumer'} onPress={() => update((p) => ({ ...p, segment: 'consumer' }))} testID="seg-consumer" />
        <Chip label="Small business" active={state.segment === 'business'} onPress={() => update((p) => ({ ...p, segment: 'business' }))} testID="seg-business" />
      </Row>

      <Card title="Describe it">
        <TextInput
          value={state.narrative}
          onChangeText={(t) => update((p) => ({ ...p, narrative: t }))}
          placeholder="e.g. 3 jars of homemade pickles and 2 silk sarees from Hyderabad to Austin"
          multiline
          style={[s.input, s.textarea]}
          testID="narrative"
        />
        <Row>
          <Button label="Read my list" tone="primary" size="sm" onPress={runParse} disabled={!state.narrative.trim()} testID="parse" />
          <Button label={scanning ? 'Scanning (simulated)…' : 'Scan a photo (simulated)'} size="sm" onPress={simulateScan} disabled={scanning} testID="scan" />
        </Row>
        {parseNote.length ? (
          <Callout kind="info">{parseNote.join('\n')}</Callout>
        ) : (
          <Fine>The photo scan is a simulation — it suggests common items, you confirm what's real.</Fine>
        )}
      </Card>

      {state.pending.length ? (
        <Card title="Suggested from your photo" right={<Badge label="Simulated" kind="accent" />}>
          {state.pending.map((p) => (
            <View key={p.uid} style={s.pendingRow} testID="pending-item">
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{p.desc}</Text>
                <Text style={s.itemMeta}>
                  {p.qty} {p.unit} · {p.weightKg} kg
                </Text>
              </View>
              <Button label="Add" tone="primary" size="sm" onPress={() => confirmPending(p.uid)} />
              <Button label="Skip" tone="ghost" size="sm" onPress={() => dismissPending(p.uid)} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card title={`Your items (${state.items.length})`} right={<Button label="+ Add by hand" size="sm" onPress={addManual} testID="add-manual" />}>
        {state.items.length === 0 ? <Fine>Nothing yet. Describe it above or add by hand.</Fine> : null}
        {state.items.map((it) => {
          const r = rules.find((x) => x.id === it.ruleId);
          if (editing !== it.uid) {
            return (
              <Pressable key={it.uid} onPress={() => setEditing(it.uid)} style={s.item} accessibilityRole="button" testID="item">
                <View style={{ flex: 1 }}>
                  <Row>
                    <Text style={s.itemName}>{it.desc}</Text>
                    {it.source === 'ai-confirmed' ? <Badge label="AI · you confirmed" kind="accent" /> : null}
                  </Row>
                  <Text style={s.itemMeta}>
                    {it.qty} {it.unit} · {it.weightKg} kg · {money(it.valueUsd)} · {r ? r.name : 'Needs a category'}
                  </Text>
                </View>
                <Text style={s.edit}>Edit</Text>
              </Pressable>
            );
          }
          return (
            <View key={it.uid} style={[s.item, s.itemEditing]} testID="item-editor">
              <Text style={s.label}>What is it</Text>
              <TextInput value={it.desc} onChangeText={(t) => patchItem(it.uid, { desc: t })} style={s.input} placeholder="e.g. Homemade pickles" />
              <Text style={s.label}>Category</Text>
              <View style={s.chips}>
                <Chip label="Other / not sure" active={!it.ruleId} onPress={() => patchItem(it.uid, { ruleId: null })} />
                {rules.map((x) => (
                  <Chip key={x.id} label={x.name} active={it.ruleId === x.id} onPress={() => patchItem(it.uid, { ruleId: x.id })} />
                ))}
              </View>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Quantity</Text>
                  <TextInput value={String(it.qty)} keyboardType="decimal-pad" onChangeText={(t) => patchItem(it.uid, { qty: parseFloat(t) || 1 })} style={s.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Weight (kg)</Text>
                  <TextInput
                    value={String(it.weightKg)}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => patchItem(it.uid, { weightKg: Engine.round2(parseFloat(t) || 0) })}
                    style={[s.input, !(it.weightKg > 0) && s.invalid]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Value ($)</Text>
                  <TextInput
                    value={String(it.valueUsd)}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => patchItem(it.uid, { valueUsd: Engine.round2(parseFloat(t) || 0) })}
                    style={s.input}
                  />
                </View>
              </Row>
              <View style={s.chips}>
                {UNITS.map((u) => (
                  <Chip key={u} label={u} active={it.unit === u} onPress={() => patchItem(it.uid, { unit: u })} />
                ))}
              </View>
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button label="Remove" tone="ghost" size="sm" onPress={() => removeItem(it.uid)} />
                <Button label="Done" tone="primary" size="sm" onPress={() => setEditing(null)} disabled={!it.desc.trim() || !(it.weightKg > 0)} />
              </Row>
            </View>
          );
        })}
      </Card>

      <Card title="Where is it going?">
        <Text style={s.label}>From</Text>
        <View style={s.chips}>
          {SEED.meta.originCountries.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={state.originCountry === c.id}
              onPress={() => update((p) => ({ ...p, originCountry: c.id, corridor: `${c.id}-US`, origin: c.cities[0] }))}
            />
          ))}
        </View>
        <View style={s.chips}>
          {originCountry.cities.map((c) => (
            <Chip key={c} label={c} active={state.origin === c} onPress={() => update((p) => ({ ...p, origin: c }))} />
          ))}
        </View>
        <Text style={s.label}>To (US)</Text>
        <View style={s.chips}>
          {SEED.meta.destinations.map((d) => (
            <Chip key={d} label={d} active={state.dest === d} onPress={() => update((p) => ({ ...p, dest: d }))} testID={`dest-${d}`} />
          ))}
        </View>
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s3 },
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
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  invalid: { borderColor: colors.errorFg },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: space.s2, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingVertical: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  itemEditing: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingVertical: space.s2 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  edit: { fontSize: 13, color: colors.accentFg },
});
