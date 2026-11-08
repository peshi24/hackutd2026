import { Redirect, Link } from "expo-router";
import { Text, View } from "react-native";
import { useSession } from "../../auth/Session";

export default function Callback() {
  const { connection, busy, error } = useSession();
  if (connection) return <Redirect href="/home" />;
  if (error) return <Redirect href="/login" />;
  return <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
    <Text>{busy ? "Completing sign-in?" : "Return to the window where you started sign-in. If the app restarted, start sign-in again."}</Text>
    {!busy && <Link href="/login">Back to sign in</Link>}
  </View>;
}
