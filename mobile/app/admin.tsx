// Admin — read-only community reports list (hide/show deferred per spec).
// Mirrors the web "Community reports" tab: role filter chips, role/stage
// badges, taps as chips, story, photo thumbnails. No auth today, same as web.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getState, photoUrl } from '../src/api';
import type { Report } from '../src/api';
import { Badge, Button, Callout, Card, Chip, Fine, Lede, Row, Title, money } from '../src/components/ui';
import { colors, radius, space } from '../src/theme';

type Filter = 'all' | 'sender' | 'receiver' | 'hidden';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['sender', 'Sender'],
  ['receiver', 'Receiver'],
  ['hidden', 'Hidden'],
];

export function filterReports(reports: Report[], f: Filter): Report[] {
  if (f === 'hidden') return reports.filter((r) => r.hidden);
  const visible = reports.filter((r) => !r.hidden);
  return f === 'all' ? visible : visible.filter((r) => r.role === f);
}

// Taps rendered as chips — only the fields that moment asked for.
export function tapLabels(r: Report): string[] {
  const out: string[] = [];
  if (r.verdict) out.push(r.verdict === 'yes' ? 'Matches' : 'Not quite');
  if (r.outcome) out.push(r.outcome === 'smooth' ? 'Went smoothly' : 'Had a hiccup');
  if (r.carrier) out.push(r.carrier);
  if (r.estimatedCost != null && r.actualCost != null) out.push(`paid ${money(r.actualCost)} vs ${money(r.estimatedCost)}`);
  if (r.arrived != null) out.push(r.arrived ? 'Arrived' : 'Still waiting');
  for (const c of r.condition || []) out.push(c.replace(/_/g, ' '));
  return out;
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; reports: Report[] };

export default function Admin() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    getState()
      .then((st) => {
        if (!cancelled) setLoad({ kind: 'ready', reports: st.reports.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoad({ kind: 'error', message: e instanceof Error ? e.message : 'Could not load reports' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = load.kind === 'ready' ? filterReports(load.reports, filter) : [];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={s.logo}>Ship2US</Text>
          <Button label="Back" tone="ghost" size="sm" onPress={() => router.back()} />
        </Row>
        <Title>Community reports</Title>
        <Lede>Read-only on mobile. Hide and show live in the web admin; this list is open with no login — demo only.</Lede>
        <Row>
          {FILTERS.map(([k, l]) => (
            <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} testID={`filter-${k}`} />
          ))}
        </Row>

        {load.kind === 'loading' ? <ActivityIndicator color={colors.accentFg} /> : null}
        {load.kind === 'error' ? <Callout kind="err">{load.message}</Callout> : null}
        {load.kind === 'ready' && rows.length === 0 ? <Callout kind="info">No reports here yet.</Callout> : null}

        {rows.map((r) => (
          <Card key={r.id} style={s.report} testID={`report-${r.id}`}>
            <Row>
              <Badge label={r.role} kind={r.role === 'receiver' ? 'accent' : 'neutral'} />
              <Badge label={r.stage} />
              <Badge label="unverified" kind="warning" />
              {r.hidden ? <Badge label="hidden" kind="error" /> : null}
            </Row>
            <Text style={s.meta}>
              {r.corridor} · {r.segment} · {new Date(r.submittedAt).toLocaleString()}
              {r.senderName ? ` · from ${r.senderName}` : ''}
            </Text>
            {tapLabels(r).length ? (
              <View style={s.chips}>
                {tapLabels(r).map((t) => (
                  <Chip key={t} label={t} />
                ))}
              </View>
            ) : null}
            {r.story ? <Text style={s.story}>"{r.story}"</Text> : null}
            {r.photos.length ? (
              <View style={s.photos}>
                {r.photos.map((p) => (
                  <Image key={p} source={{ uri: photoUrl(p) }} style={s.thumb} accessibilityLabel="Community photo" />
                ))}
              </View>
            ) : null}
          </Card>
        ))}

        <Fine center>Community input is stored apart from seeded rules and never changes what the engine says.</Fine>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceBase },
  scroll: { padding: space.s4, gap: space.s3, maxWidth: 720, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary },
  report: { gap: space.s2 },
  meta: { fontSize: 12, color: colors.textTertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 },
  story: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceHover },
});
