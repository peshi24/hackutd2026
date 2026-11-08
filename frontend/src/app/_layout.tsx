import { Stack } from "expo-router";
import { SessionProvider, useSession } from "../../auth/Session";

function Routes() {
  const { authorizationSkipped, connection, restoring } = useSession();
  const canAccessHome = authorizationSkipped || !!connection;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="callback" />
      <Stack.Protected guard={!restoring && !canAccessHome}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!restoring && canAccessHome}>
        <Stack.Screen name="home" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="showLocations" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
