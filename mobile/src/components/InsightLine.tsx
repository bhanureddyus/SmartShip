// Mirrors web `renderInsight(ins, { variant })`. The unverified badge is
// rendered unconditionally — a caller cannot omit it.
import { Image, StyleSheet, Text, View } from 'react-native';
import { photoUrl } from '../api';
import { Engine } from '../engine';
import type { RuleInsight } from '../engine.d';
import { colors, radius, space } from '../theme';
import { Badge } from './ui';

export const UNVERIFIED_LABEL = 'Community input · unverified';
export const EMPTY_INSIGHT = 'Be the first family to report on this.';

export function insightFacts(ins: RuleInsight): string {
  return [
    `${ins.reports} families`,
    ins.openedByCustoms ? `${ins.openedByCustoms} opened at customs` : null,
    ins.damaged ? `${ins.damaged} damaged` : null,
    ins.missing ? `${ins.missing} missing` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function InsightLine({ insight, variant = 'check' }: { insight: RuleInsight | null | undefined; variant?: 'check' | 'cost' }) {
  const badge = <Badge label={UNVERIFIED_LABEL} kind="warning" testID="insight-badge" />;
  if (!insight || insight.sparse || insight.reports < Engine.INSIGHT_MIN_REPORTS) {
    return (
      <View style={s.wrap} testID="insight-empty">
        {badge}
        <Text style={s.empty}>{EMPTY_INSIGHT}</Text>
      </View>
    );
  }
  const story = insight.stories && insight.stories[0];
  const photos = (insight.photos || []).slice(0, 3);
  return (
    <View style={[s.wrap, variant === 'cost' && s.wrapCost]} testID="insight">
      {badge}
      <Text style={s.facts}>{insightFacts(insight)}</Text>
      {story ? <Text style={s.story}>“{story.story}”</Text> : null}
      {photos.length ? (
        <View style={s.photos}>
          {photos.map((p) => (
            <Image key={p} source={{ uri: photoUrl(p) }} style={s.thumb} accessibilityLabel="Community photo" />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: space.s3, gap: space.s2 },
  wrapCost: { marginTop: space.s2 },
  empty: { fontSize: 13, color: colors.textTertiary },
  facts: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  story: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  photos: { flexDirection: 'row', gap: space.s2 },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceHover },
});
