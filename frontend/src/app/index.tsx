import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSession } from "../../auth/Session";

export default function Index() {
  const { authorizationSkipped, connection, restoring } = useSession();

  if (restoring) {
    return (
      <View style={styles.container}>
        <ActivityIndicator accessibilityLabel="Restoring session" />
      </View>
    );
  }

  return (
    <Redirect href={connection || authorizationSkipped ? "/home" : "/login"} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
