// Mirrors web `renderQuickTap({ stage, answered, onAnswer })`: one-line
// "Does this match what you've seen?" with Yes · Not quite · Tell a story.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Verdict } from '../api';
import { colors, radius, space } from '../theme';
import { PhotoPicker } from './PhotoPicker';
import { Button, Chip } from './ui';

export const STORY_MAX = 280;
export const PHOTOS_MAX = 4;

export interface QuickTapProps {
  stage: 'check' | 'pack' | 'cost';
  answered: boolean;
  onAnswer: (verdict: Verdict | undefined, story?: string, photos?: string[]) => void | Promise<unknown>;
  // Needed only when the story pane uploads photos.
  shipmentId?: string;
}

export function QuickTap({ stage, answered, onAnswer, shipmentId }: QuickTapProps) {
  const [storyOpen, setStoryOpen] = useState(false);
  const [story, setStory] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [busy, setBusy] = useState(false);

  if (answered) {
    return (
      <View style={[s.wrap, s.done]} testID={`qtap-${stage}-done`}>
        <Text style={s.doneText}>✓ Thanks — noted for the next family.</Text>
      </View>
    );
  }

  const submit = async (verdict: Verdict | undefined, withStory: boolean) => {
    setBusy(true);
    try {
      await onAnswer(verdict, withStory ? story.trim() || undefined : undefined, withStory && photos.length ? photos : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap} testID={`qtap-${stage}`}>
      <Text style={s.q}>Does this match what you've seen?</Text>
      <View style={s.chips}>
        <Chip label="Yes" onPress={busy ? undefined : () => submit('yes', false)} testID="qtap-yes" />
        <Chip label="Not quite" onPress={busy ? undefined : () => submit('not_quite', false)} testID="qtap-not-quite" />
        <Chip label="Tell a story" ghost onPress={() => setStoryOpen((v) => !v)} testID="qtap-story" />
      </View>
      {storyOpen ? (
        <View style={s.story}>
          <TextInput
            value={story}
            onChangeText={(t) => setStory(t.slice(0, STORY_MAX))}
            placeholder="One line for the next family"
            placeholderTextColor={colors.textTertiary}
            maxLength={STORY_MAX}
            style={s.input}
            testID="qtap-story-input"
          />
          {shipmentId ? <PhotoPicker max={PHOTOS_MAX} target={{ kind: 'shipment', shipmentId, role: 'sender' }} onChange={setPhotos} onPending={setPendingUploads} /> : null}
          <Button
            label={pendingUploads ? 'Uploading photos…' : 'Send'}
            tone="primary"
            size="sm"
            disabled={busy || pendingUploads > 0 || (!story.trim() && !photos.length)}
            onPress={() => submit(undefined, true)}
            testID="qtap-send"
          />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: space.s4,
    padding: space.s4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfacePrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: space.s3,
  },
  done: { backgroundColor: colors.successBg, borderColor: colors.successBg },
  doneText: { color: colors.successFg, fontSize: 14, fontWeight: '500' },
  q: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  story: { gap: space.s3 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfacePrimary,
  },
});
