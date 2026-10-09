// Receiver arrival flow — five panes, all one-tap except the story:
//   1 Arrived / Still waiting · 2 How was it? · 3 Add photos · 4 One line · 5 Send
// Pure over props so the Jest suite can drive it without expo-router; the
// route at app/r/[token].tsx owns fetching and posting.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Condition, ReceiverReportInput, Report, ShareContext } from '../api';
import { colors, radius, space } from '../theme';
import { PhotoPicker } from './PhotoPicker';
import type { PhotoPickerProps } from './PhotoPicker';
import { Badge, Button, Callout, Chip, Fine, Row } from './ui';

export const RECEIVER_PANES = ['arrived', 'condition', 'photos', 'story', 'send'] as const;
export type ReceiverPane = (typeof RECEIVER_PANES)[number];

export const CONDITIONS: { key: Condition; label: string }[] = [
  { key: 'all_good', label: 'All good' },
  { key: 'damaged', label: 'Something damaged' },
  { key: 'missing', label: 'Something missing' },
  { key: 'opened_by_customs', label: 'Was opened by customs' },
];

export const STORY_MAX = 280;
export const MAX_PHOTOS = 4;

export function senderLine(ctx: Pick<ShareContext, 'senderName' | 'boxes' | 'origin'>): string {
  const who = ctx.senderName?.trim() || 'Someone';
  const what = ctx.boxes == null ? 'a shipment' : `${ctx.boxes} box${ctx.boxes === 1 ? '' : 'es'}`;
  const from = ctx.origin ? ` from ${ctx.origin}` : '';
  return `${who} sent you ${what}${from}.`;
}

// "All good" is exclusive; any problem deselects it (same rule as the web receiver page).
export function toggleCondition(current: Condition[], key: Condition): Condition[] {
  if (current.includes(key)) return current.filter((c) => c !== key);
  if (key === 'all_good') return ['all_good'];
  return [...current.filter((c) => c !== 'all_good'), key];
}

export interface ReceiverFlowProps {
  context: ShareContext;
  token: string;
  onSubmit: (report: ReceiverReportInput) => Promise<void>;
  acquire?: PhotoPickerProps['acquire'];
}

export function ReceiverFlow({ context, token, onSubmit, acquire }: ReceiverFlowProps) {
  const [pane, setPane] = useState<number>(0);
  const [arrived, setArrived] = useState<boolean | null>(null);
  const [condition, setCondition] = useState<Condition[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [story, setStory] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = RECEIVER_PANES[pane];
  const next = () => setPane((p) => Math.min(RECEIVER_PANES.length - 1, p + 1));
  const back = () => setPane((p) => Math.max(0, p - 1));

  const send = async () => {
    if (sending || pending > 0 || arrived == null) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({
        arrived,
        condition: arrived && condition.length ? condition : undefined,
        story: story.trim() ? story.trim().slice(0, STORY_MAX) : undefined,
        photos: photos.length ? photos : undefined,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't send — try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.col} testID={`pane-${current}`}>
      <Row style={s.dots}>
        {RECEIVER_PANES.map((p, i) => (
          <View key={p} style={[s.dot, i === pane && s.dotOn, i < pane && s.dotDone]} testID={`dot-${p}${i === pane ? '-active' : ''}`} />
        ))}
      </Row>

      {current === 'arrived' ? (
        <>
          <Text style={s.q}>{senderLine(context)} Did it arrive?</Text>
          <Row>
            <Button label="Arrived" tone={arrived === true ? 'primary' : 'secondary'} onPress={() => { setArrived(true); next(); }} testID="arrived-yes" />
            <Button label="Still waiting" tone={arrived === false ? 'primary' : 'secondary'} onPress={() => { setArrived(false); setCondition([]); setPane(3); }} testID="arrived-no" />
          </Row>
          <Fine>One link, one report. Nothing here is shared with carriers or customs.</Fine>
        </>
      ) : null}

      {current === 'condition' ? (
        <>
          <Text style={s.q}>How was it?</Text>
          <View style={s.chips}>
            {CONDITIONS.map((c) => (
              <Chip key={c.key} label={c.label} active={condition.includes(c.key)} onPress={() => setCondition((cur) => toggleCondition(cur, c.key))} testID={`cond-${c.key}`} />
            ))}
          </View>
          <Row style={s.nav}>
            <Button label="Back" tone="ghost" onPress={back} />
            <Button label="Next" tone="primary" onPress={next} disabled={condition.length === 0} testID="next-condition" />
          </Row>
        </>
      ) : null}

      {current === 'photos' ? (
        <>
          <Text style={s.q}>Add photos</Text>
          <Text style={s.sub}>Up to {MAX_PHOTOS}. Box, contents, anything that was opened or damaged — it helps the next family.</Text>
          <PhotoPicker max={MAX_PHOTOS} target={{ kind: 'share', token }} onChange={setPhotos} onPending={setPending} acquire={acquire} />
          <Row style={s.nav}>
            <Button label="Back" tone="ghost" onPress={back} />
            <Button label={photos.length ? 'Next' : 'Skip'} tone="primary" onPress={next} testID="next-photos" />
          </Row>
        </>
      ) : null}

      {current === 'story' ? (
        <>
          <Text style={s.q}>One line for the next family</Text>
          <TextInput
            value={story}
            onChangeText={(t) => setStory(t.slice(0, STORY_MAX))}
            placeholder="Optional — e.g. pickles arrived fine, customs opened box 2"
            maxLength={STORY_MAX}
            multiline
            style={[s.input, { minHeight: 72 }]}
            testID="story-input"
          />
          <Row style={s.nav}>
            <Button label="Back" tone="ghost" onPress={() => (arrived === false ? setPane(0) : back())} />
            <Button label={story.trim() ? 'Next' : 'Skip'} tone="primary" onPress={next} testID="next-story" />
          </Row>
        </>
      ) : null}

      {current === 'send' ? (
        <>
          <Text style={s.q}>Ready to send?</Text>
          <View style={s.recap}>
            <Text style={s.recapLine}>{arrived ? 'Arrived' : 'Still waiting'}</Text>
            {condition.length ? <Text style={s.recapLine}>{condition.map((c) => CONDITIONS.find((x) => x.key === c)?.label || c).join(' · ')}</Text> : null}
            {photos.length ? <Text style={s.recapLine}>{photos.length} photo{photos.length === 1 ? '' : 's'}</Text> : null}
            {story.trim() ? <Text style={s.recapStory}>"{story.trim()}"</Text> : null}
          </View>
          <Badge label="Community input · unverified" kind="warning" />
          {error ? <Callout kind="err">{error}</Callout> : null}
          <Row style={s.nav}>
            <Button label="Back" tone="ghost" onPress={back} />
            <Button
              label={sending ? 'Sending…' : pending > 0 ? `Uploading ${pending} photo…` : 'Send'}
              tone="primary"
              onPress={send}
              disabled={sending || pending > 0 || arrived == null}
              testID="receiver-send"
            />
          </Row>
        </>
      ) : null}
    </View>
  );
}

// Read-only recap shown when the token was already used.
export function ReceiverRecap({ report }: { report: Report | undefined }) {
  return (
    <View style={s.col} testID="receiver-recap">
      <Callout kind="ok">Already sent — thank you.</Callout>
      {report ? (
        <View style={s.recap}>
          <Text style={s.recapLine}>{report.arrived ? 'Arrived' : 'Still waiting'}</Text>
          {report.condition?.length ? <Text style={s.recapLine}>{report.condition.map((c) => CONDITIONS.find((x) => x.key === c)?.label || c).join(' · ')}</Text> : null}
          {report.photos.length ? <Text style={s.recapLine}>{report.photos.length} photo{report.photos.length === 1 ? '' : 's'}</Text> : null}
          {report.story ? <Text style={s.recapStory}>"{report.story}"</Text> : null}
          <Badge label="Community input · unverified" kind="warning" />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  col: { gap: space.s4 },
  dots: { justifyContent: 'center', gap: space.s2 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.borderDefault },
  dotOn: { backgroundColor: colors.accentFg, width: 20 },
  dotDone: { backgroundColor: colors.successFg },
  q: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 28 },
  sub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  nav: { justifyContent: 'space-between', marginTop: space.s2 },
  recap: { gap: 4, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.lg, padding: space.s3 },
  recapLine: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  recapStory: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  input: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfacePrimary,
    textAlignVertical: 'top',
  },
});
