// Mirrors web `renderPhotoPicker({ max })`: camera first, library second,
// client-side downscale to ≤ 1600 px, raw-bytes POST to /api/photo.
// `onChange(uris)` reports the server paths of successful uploads; `onPending`
// lets the host disable Send while any upload is still in flight.
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { photoUrl, uploadPhoto, uploadReceiverPhoto, type PhotoMime, type ReportRole } from '../api';
import { colors, radius, space } from '../theme';
import { Chip } from './ui';

export const MAX_EDGE_PX = 1600;

// Where uploads go: senders know their shipment; receivers only hold a token.
export type PhotoTarget = { kind: 'shipment'; shipmentId: string; role: ReportRole } | { kind: 'share'; token: string };

export function uploadTo(target: PhotoTarget, bytes: Blob | ArrayBuffer, mime: PhotoMime): Promise<string> {
  return target.kind === 'share' ? uploadReceiverPhoto(target.token, bytes, mime) : uploadPhoto(target.shipmentId, target.role, bytes, mime);
}

export interface PhotoPickerProps {
  max: number;
  target: PhotoTarget;
  onChange: (uris: string[]) => void;
  onPending?: (pending: number) => void;
  // Test seam: replaces the picker + manipulator + upload chain.
  acquire?: (source: 'camera' | 'library') => Promise<{ bytes: Blob | ArrayBuffer; mime: PhotoMime } | null>;
}

interface Slot {
  key: string;
  localUri: string | null;
  path: string | null;
  status: 'uploading' | 'done' | 'error';
}

export function resizeTarget(width: number, height: number, maxEdge = MAX_EDGE_PX): { width?: number; height?: number } | null {
  if (!width || !height || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

async function pickAndResize(source: 'camera' | 'library'): Promise<{ localUri: string; bytes: Blob; mime: PhotoMime } | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync(opts);
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchImageLibraryAsync(opts);
  }
  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];

  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const target = resizeTarget(asset.width, asset.height);
  if (target) ctx.resize(target);
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
  const bytes = await (await fetch(saved.uri)).blob();
  return { localUri: saved.uri, bytes, mime: 'image/jpeg' };
}

export function PhotoPicker({ max, target, onChange, onPending, acquire }: PhotoPickerProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const seq = useRef(0);

  const done = slots.filter((s) => s.status === 'done').map((s) => s.path as string);
  const pending = slots.filter((s) => s.status === 'uploading').length;
  const doneKey = done.join('|');

  useEffect(() => {
    onChange(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);
  useEffect(() => {
    onPending?.(pending);
  }, [pending, onPending]);

  const add = useCallback(
    async (source: 'camera' | 'library') => {
      if (slots.length >= max) return;
      const key = 'ph_' + ++seq.current;
      let picked: { localUri: string | null; bytes: Blob | ArrayBuffer; mime: PhotoMime } | null = null;
      try {
        picked = acquire ? await acquire(source).then((p) => (p ? { localUri: null, ...p } : null)) : await pickAndResize(source);
      } catch (e: unknown) {
        console.warn('photo pick failed', e);
        picked = null;
      }
      if (!picked) return;
      setSlots((prev) => [...prev, { key, localUri: picked.localUri, path: null, status: 'uploading' }]);
      try {
        const path = await uploadTo(target, picked.bytes, picked.mime);
        setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, path, status: 'done' } : s)));
      } catch (e: unknown) {
        console.warn('photo upload failed', e);
        setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, status: 'error' } : s)));
      }
    },
    [slots.length, max, acquire, target],
  );

  const remove = useCallback((key: string) => setSlots((prev) => prev.filter((s) => s.key !== key)), []);
  const full = slots.length >= max;

  return (
    <View style={s.wrap} testID="photo-picker">
      <View style={s.actions}>
        <Chip label="Take a photo" onPress={full ? undefined : () => add('camera')} testID="photo-camera" />
        <Chip label="From library" ghost onPress={full ? undefined : () => add('library')} testID="photo-library" />
        <Text style={s.count}>
          {slots.length}/{max}
        </Text>
      </View>
      {slots.length ? (
        <View style={s.thumbs}>
          {slots.map((slot) => (
            <View key={slot.key} style={[s.thumbWrap, slot.status === 'error' && s.thumbError]} testID={`photo-slot-${slot.status}`}>
              {slot.localUri || slot.path ? (
                <Image source={{ uri: slot.localUri || photoUrl(slot.path as string) }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbPlaceholder]} />
              )}
              {slot.status === 'uploading' ? <Text style={s.state}>Uploading…</Text> : null}
              {slot.status === 'error' ? <Text style={[s.state, { color: colors.errorFg }]}>Couldn't add this one</Text> : null}
              <Pressable onPress={() => remove(slot.key)} style={s.remove} accessibilityRole="button" accessibilityLabel="Remove photo">
                <Text style={s.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.s2, marginTop: space.s2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' },
  count: { fontSize: 12, color: colors.textTertiary, marginLeft: 'auto' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  thumbWrap: { width: 84, alignItems: 'center' },
  thumbError: { opacity: 0.8 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceHover },
  thumbPlaceholder: { borderWidth: 1, borderColor: colors.borderDefault },
  state: { fontSize: 11, color: colors.textTertiary, marginTop: 2, textAlign: 'center' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.buttonPrimaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.buttonPrimaryFg, fontSize: 14, lineHeight: 16, fontWeight: '700' },
});
