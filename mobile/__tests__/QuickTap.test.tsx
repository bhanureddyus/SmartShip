// M3 — QuickTap: tapping Yes calls onAnswer('yes'); answered renders the done state.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QuickTap } from '../src/components/QuickTap';

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));

// submit() awaits onAnswer then flips `busy` back — flush that inside act.
const press = (testID: string) => act(async () => fireEvent.press(screen.getByTestId(testID)));

describe('QuickTap (M3)', () => {
  test('tapping Yes calls onAnswer with "yes" and no story', async () => {
    const onAnswer = jest.fn();
    render(<QuickTap stage="check" answered={false} shipmentId="shp_test" onAnswer={onAnswer} />);
    expect(screen.getByText("Does this match what you've seen?")).toBeTruthy();
    await press('qtap-yes');
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('yes', undefined, undefined);
  });

  test('tapping Not quite calls onAnswer with "not_quite"', async () => {
    const onAnswer = jest.fn();
    render(<QuickTap stage="cost" answered={false} shipmentId="shp_test" onAnswer={onAnswer} />);
    await press('qtap-not-quite');
    expect(onAnswer).toHaveBeenCalledWith('not_quite', undefined, undefined);
  });

  test('answered renders the done state and no tap targets', () => {
    render(<QuickTap stage="pack" answered onAnswer={jest.fn()} shipmentId="shp_test" />);
    expect(screen.getByTestId('qtap-pack-done')).toBeTruthy();
    expect(screen.getByText(/Thanks — noted for the next family/)).toBeTruthy();
    expect(screen.queryByTestId('qtap-yes')).toBeNull();
  });

  test('Tell a story opens the story line and Send passes the trimmed story through', async () => {
    const onAnswer = jest.fn();
    render(<QuickTap stage="check" answered={false} shipmentId="shp_test" onAnswer={onAnswer} />);
    fireEvent.press(screen.getByTestId('qtap-story'));
    fireEvent.changeText(screen.getByTestId('qtap-story-input'), '  Pickles got opened at customs  ');
    await press('qtap-send');
    expect(onAnswer).toHaveBeenCalledWith(undefined, 'Pickles got opened at customs', undefined);
  });
});
