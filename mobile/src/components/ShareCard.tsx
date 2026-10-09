// Mirrors the web share card: "Let whoever's receiving this tell us it
// arrived" — sender first name, the link, a QR, and a native share sheet.
import { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, space } from '../theme';
import { Button, Card, Fine } from './ui';

export const SENDER_NAME_MAX = 24;

export interface ShareCardProps {
  url: string;
  senderName: string;
  onNameChange: (name: string) => void;
}

export function ShareCard({ url, senderName, onNameChange }: ShareCardProps) {
  const [shared, setShared] = useState<'idle' | 'done' | 'error'>('idle');

  const share = async () => {
    try {
      const who = senderName.trim() ? `${senderName.trim()} sent you a shipment` : 'Someone sent you a shipment';
      await Share.share({ message: `${who} via Ship2US. Did it arrive? Tell us here: ${url}`, url });
      setShared('done');
    } catch (e: unknown) {
      console.warn('share failed', e);
      setShared('error');
    }
  };

  return (
    <Card title="Let whoever's receiving this tell us it arrived">
      <Text style={s.lead}>Send the receiver this link — no app, no login. They tap through five quick screens.</Text>
      <Text style={s.label}>Your first name (optional, shown to the receiver)</Text>
      <TextInput
        value={senderName}
        onChangeText={(t) => onNameChange(t.slice(0, SENDER_NAME_MAX))}
        placeholder="e.g. Bhanu"
        placeholderTextColor={colors.textTertiary}
        maxLength={SENDER_NAME_MAX}
        style={s.input}
        testID="share-name"
      />
      <View style={s.qrWrap} testID="share-qr">
        <QRCode value={url} size={168} backgroundColor={colors.surfacePrimary} color={colors.buttonPrimaryBg} />
      </View>
      <Text selectable style={s.url} testID="share-url">
        {url}
      </Text>
      <Button label="Share link" tone="primary" onPress={share} testID="share-button" />
      {shared === 'done' ? <Fine center>Shared — thank you.</Fine> : null}
      {shared === 'error' ? <Fine center>Couldn't open the share sheet — copy the link above instead.</Fine> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: space.s3 },
  label: { fontSize: 12, color: colors.textTertiary, fontWeight: '600', marginBottom: space.s1, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: space.s4,
  },
  qrWrap: { alignItems: 'center', paddingVertical: space.s3 },
  url: { fontSize: 12, color: colors.accentFg, textAlign: 'center', marginBottom: space.s3 },
});
