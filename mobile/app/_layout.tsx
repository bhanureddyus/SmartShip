// Root: Stack navigator + journey store provider. Reads EXPO_PUBLIC_API_BASE
// through src/api.ts; light mode only in this cut.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreContext, useStoreValue } from '../src/store';
import { colors } from '../src/theme';

export default function RootLayout() {
  const store = useStoreValue();
  return (
    <SafeAreaProvider>
      <StoreContext.Provider value={store}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surfaceBase },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="estimate" />
          <Stack.Screen name="r/[token]" />
          <Stack.Screen name="admin" />
        </Stack>
      </StoreContext.Provider>
    </SafeAreaProvider>
  );
}
