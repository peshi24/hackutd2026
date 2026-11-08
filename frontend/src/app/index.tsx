import { Redirect } from "expo-router";
import { useSession } from "../../auth/Session";
export default function Index() {
  const { connection } = useSession();
  return <Redirect href={connection ? "/home" : "/login"} />;
}
