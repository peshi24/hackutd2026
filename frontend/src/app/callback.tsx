import { Link, Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSession } from "../../auth/Session";

export default function Callback() {
  const { authorizationSkipped, connection, error } = useSession();

  if (connection || authorizationSkipped) {
    return <Redirect href="/home" />;
  }

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.message}>{error}</Text>
          <Link href="/login">Return to sign in</Link>
        </>
      ) : (
        <>
          <ActivityIndicator accessibilityLabel="Completing sign-in" />
          <Text style={styles.message}>
            Return to the window where you started sign-in. The authorization
            response is handled there.
          </Text>
          <Link href="/login">Back to sign in</Link>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: {
    marginVertical: 16,
    textAlign: "center",
  },
});
