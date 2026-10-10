// M3 — receiver flow: panes render in order; Send is disabled while a photo
// upload is pending and enabled once it resolves; submit carries the taps.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReceiverFlow, ReceiverRecap, senderLine, toggleCondition } from '../src/components/ReceiverFlow';
import type { ShareContext } from '../src/api';

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));

// Deferred upload so the test controls when "pending" clears.
const uploads: Array<(path: string) => void> = [];
jest.mock('../src/api', () => {
  const actual = jest.requireActual<typeof import('../src/api')>('../src/api');
  return {
    ...actual,
    uploadReceiverPhoto: jest.fn(() => new Promise<string>((resolve) => uploads.push(resolve))),
  };
});

const ctx: ShareContext = { senderName: 'Bhanu', boxes: 3, origin: 'Hyderabad', dest: 'Austin', used: false };
const fakeAcquire = async () => ({ bytes: new ArrayBuffer(8), mime: 'image/jpeg' as const });
const isDisabled = (testID: string) => Boolean(screen.getByTestId(testID).props.accessibilityState?.disabled);

describe('ReceiverFlow (M3)', () => {
  beforeEach(() => uploads.splice(0));

  test('pure helpers', () => {
    expect(senderLine(ctx)).toBe('Bhanu sent you 3 boxes from Hyderabad.');
    expect(senderLine({ senderName: null, boxes: null, origin: null })).toBe('Someone sent you a shipment.');
    expect(toggleCondition([], 'damaged')).toEqual(['damaged']);
    expect(toggleCondition(['damaged'], 'all_good')).toEqual(['all_good']);
    expect(toggleCondition(['all_good'], 'missing')).toEqual(['missing']);
    expect(toggleCondition(['missing'], 'missing')).toEqual([]);
  });

  test('panes render in order: arrived → condition → photos → story → send', async () => {
    const onSubmit = jest.fn(async () => undefined);
    render(<ReceiverFlow context={ctx} token="tok_test" onSubmit={onSubmit} acquire={fakeAcquire} />);

    expect(screen.getByTestId('pane-arrived')).toBeTruthy();
    expect(screen.getByText(/Bhanu sent you 3 boxes from Hyderabad\. Did it arrive\?/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('arrived-yes'));

    expect(screen.getByTestId('pane-condition')).toBeTruthy();
    expect(isDisabled('next-condition')).toBe(true);
    fireEvent.press(screen.getByTestId('cond-opened_by_customs'));
    fireEvent.press(screen.getByTestId('next-condition'));

    expect(screen.getByTestId('pane-photos')).toBeTruthy();
    fireEvent.press(screen.getByTestId('next-photos'));

    expect(screen.getByTestId('pane-story')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('story-input'), 'Box 2 was opened but nothing missing');
    fireEvent.press(screen.getByTestId('next-story'));

    expect(screen.getByTestId('pane-send')).toBeTruthy();
    expect(screen.getByText('Community input · unverified')).toBeTruthy();
    expect(isDisabled('receiver-send')).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('receiver-send'));
    });
    expect(onSubmit).toHaveBeenCalledWith({
      arrived: true,
      condition: ['opened_by_customs'],
      story: 'Box 2 was opened but nothing missing',
      photos: undefined,
    });
  });

  test('Still waiting skips the condition and photo panes', () => {
    render(<ReceiverFlow context={ctx} token="tok_test" onSubmit={jest.fn(async () => undefined)} acquire={fakeAcquire} />);
    fireEvent.press(screen.getByTestId('arrived-no'));
    expect(screen.getByTestId('pane-story')).toBeTruthy();
  });

  test('Send is disabled while a photo upload is pending and enables when it resolves', async () => {
    const onSubmit = jest.fn(async () => undefined);
    render(<ReceiverFlow context={ctx} token="tok_test" onSubmit={onSubmit} acquire={fakeAcquire} />);
    fireEvent.press(screen.getByTestId('arrived-yes'));
    fireEvent.press(screen.getByTestId('cond-all_good'));
    fireEvent.press(screen.getByTestId('next-condition'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('photo-camera'));
    });
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(screen.getByTestId('photo-slot-uploading')).toBeTruthy();

    fireEvent.press(screen.getByTestId('next-photos'));
    fireEvent.press(screen.getByTestId('next-story'));
    expect(screen.getByTestId('pane-send')).toBeTruthy();
    expect(isDisabled('receiver-send')).toBe(true);
    expect(screen.getByText('Uploading 1 photo…')).toBeTruthy();

    await act(async () => {
      uploads[0]('/uploads/shp_test/ph_1.jpg');
    });
    await waitFor(() => expect(isDisabled('receiver-send')).toBe(false));

    await act(async () => {
      fireEvent.press(screen.getByTestId('receiver-send'));
    });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ arrived: true, condition: ['all_good'], photos: ['/uploads/shp_test/ph_1.jpg'] }));
  });

  test('recap renders the submitted report read-only', () => {
    render(
      <ReceiverRecap
        report={{
          id: 'rp_1',
          shipmentId: 'shp_1',
          role: 'receiver',
          stage: 'arrival',
          corridor: 'IN-US',
          ruleIds: [],
          segment: 'consumer',
          arrived: true,
          condition: ['damaged'],
          story: 'One jar cracked',
          photos: ['/uploads/shp_1/a.jpg'],
          submittedAt: '2026-10-09T00:00:00Z',
          unverified: true,
        }}
      />,
    );
    expect(screen.getByText('Already sent — thank you.')).toBeTruthy();
    expect(screen.getByText('Something damaged')).toBeTruthy();
    expect(screen.getByText('1 photo')).toBeTruthy();
  });
});
