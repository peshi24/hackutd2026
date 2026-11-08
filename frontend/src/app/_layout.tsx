import { Stack } from "expo-router";
import { SessionProvider, useSession } from "../../auth/Session";

function Routes() {
  const { connection } = useSession();
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="callback" />
    <Stack.Protected guard={!connection}><Stack.Screen name="login" /></Stack.Protected>
    <Stack.Protected guard={!!connection}>
      <Stack.Screen name="home" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="showLocations" />
    </Stack.Protected>
  </Stack>;
}
export default function Layout() {
  return <SessionProvider><Routes /></SessionProvider>;
}
