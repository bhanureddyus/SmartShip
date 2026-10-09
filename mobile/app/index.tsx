// Landing: start / demo / resume + "From families like yours" story strip.
// Mirrors web renderLanding(); the strip hides below 3 stories, as on web.
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInsight, photoUrl } from '../src/api';
import { SEED } from '../src/data';
import { Engine } from '../src/engine';
import type { InsightStory } from '../src/engine.d';
import { demoState, newState, useStore } from '../src/store';
import { colors, radius, space } from '../src/theme';
import { Badge, Button, Card, Fine } from '../src/components/ui';
import { UNVERIFIED_LABEL } from '../src/components/InsightLine';
import { Image } from 'react-native';

export const STRIP_MIN_STORIES = Engine.INSIGHT_MIN_REPORTS;

export default function Landing() {
  const router = useRouter();
  const { state, hydrated, replace, update } = useStore();
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<InsightStory[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getInsight('IN-US', [])
      .then((ins) => {
        if (cancelled) return;
        setStories(ins.stories.slice(0, 3));
        setPhotos(ins.photos.slice(0, 3));
      })
      .catch((e: unknown) => console.warn('insight unavailable', e));
    return () => {
      cancelled = true;
    };
  }, []);

  const canResume = hydrated && state.view === 'wizard' && (state.items.length > 0 || state.step > 0);
  const start = () => {
    replace({ ...newState(), view: 'wizard' });
    router.push('/estimate/describe');
  };
  const demo = () => {
    replace(demoState());
    router.push('/estimate/describe');
  };
  const resume = () => {
    update((p) => ({ ...p, view: 'wizard' }));
    router.push(`/estimate/${['describe', 'check', 'pack', 'cost', 'ship'][state.step] ?? 'describe'}`);
  };

  return (
    <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + space.s6, paddingBottom: insets.bottom + space.s8 }]} testID="landing">
      <Text style={s.brand}>Ship2US</Text>
      <Text style={s.hero}>Know before you ship.</Text>
      <Text style={s.sub}>
        {SEED.meta.productLine} Tell us what's in the box and where it's going; we'll check it, pack it, price it, and get you to hand-over — grounded in
        what families like yours actually experienced.
      </Text>

      <View style={s.ctas}>
        <Button label="Start an estimate" tone="primary" size="lg" onPress={start} testID="landing-start" />
        <Button label="Try the Hyderabad → Austin demo" onPress={demo} testID="landing-demo" />
        {canResume ? <Button label="Resume your draft" tone="ghost" onPress={resume} testID="landing-resume" /> : null}
      </View>

      {stories.length >= STRIP_MIN_STORIES ? (
        <Card title="From families like yours" right={<Badge label={UNVERIFIED_LABEL} kind="warning" />} style={s.strip}>
          {stories.map((st, i) => (
            <View key={`${st.submittedAt}-${i}`} style={s.story} testID="landing-story">
              <Text style={s.storyText}>“{st.story}”</Text>
              <Text style={s.storyMeta}>
                {st.senderName || (st.role === 'receiver' ? 'A receiver' : 'A sender')} · {st.stage}
              </Text>
            </View>
          ))}
          {photos.length ? (
            <View style={s.photos}>
              {photos.map((p) => (
                <Image key={p} source={{ uri: photoUrl(p) }} style={s.thumb} accessibilityLabel="Community photo" />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={s.footer}>
        <Link href="/admin" style={s.link} testID="landing-admin">
          Community reports (admin)
        </Link>
        <Fine>{SEED.meta.disclaimer}</Fine>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.s5, gap: space.s3, backgroundColor: colors.surfaceBase, flexGrow: 1 },
  brand: { fontSize: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.textTertiary },
  hero: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: colors.textPrimary, lineHeight: 40 },
  sub: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  ctas: { gap: space.s3, marginTop: space.s4, marginBottom: space.s4 },
  strip: { gap: space.s3 },
  story: { paddingVertical: space.s2, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  storyText: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, fontStyle: 'italic' },
  storyMeta: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  photos: { flexDirection: 'row', gap: space.s2 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceHover },
  footer: { marginTop: space.s6, gap: space.s3 },
  link: { color: colors.accentFg, fontSize: 14 },
});
