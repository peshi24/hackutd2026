
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { connectExistingAccount } from "../../backend/client/login";
import type { AccountProfile } from "../../backend/client/module_bindings/types";

WebBrowser.maybeCompleteAuthSession();

const issuer = "https://auth.spacetimedb.com/oidc";
const clientId = process.env.EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID ?? "";


export const redirectUri =
  Platform.OS === "web" && !__DEV__
    ? "https://hackutd2026.vercel.app/callback"
    : AuthSession.makeRedirectUri({
        scheme: "neighboralert",
        path: "callback",
      });

const TOKEN_KEY = "neighboralert_auth_token";
const EXPIRY_KEY = "neighboralert_auth_expiry";

async function saveValue(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, value);
  }
}

async function getValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(key);
}

async function deleteValue(key: string) {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(key);
  }
}

async function clearSavedSession() {
  await deleteValue(TOKEN_KEY);
  await deleteValue(EXPIRY_KEY);
}

type AccountSession = ReturnType<typeof connectExistingAccount>;

type AuthState = {
  user: AccountProfile | null;
  email: string;
  setEmail: (email: string) => void;
  busy: boolean;
  ready: boolean;
  error: string | null;
  connection: AccountSession["connection"] | null;
  signIn: () => Promise<void>;
};

const Context = createContext<AuthState | null>(null);

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AccountProfile | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(
    clientId
      ? null
      : "Sign-in is not configured yet. Please contact the app team."
  );
  const [connection, setConnection] =
    useState<AccountSession["connection"] | null>(null);

  const session = useRef<AccountSession | null>(null);
  const pending = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const [discovery, setDiscovery] =
    useState<AuthSession.DiscoveryDocument | null>(null);

  function disconnect() {
    clearTimeout(expiry.current);
    expiry.current = undefined;
    const oldSession = session.current;
    session.current = null;
    setConnection(null);
    oldSession?.dispose();
  }

  function scheduleExpiry(account: AccountSession, expiresAt: number) {
    clearTimeout(expiry.current);

    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      void clearSavedSession();
      disconnect();
      setError("Your session expired. Please sign in again.");
      return;
    }

    expiry.current = setTimeout(() => {
      if (session.current !== account) return;

      void clearSavedSession();
      disconnect();
      setError("Your session expired. Please sign in again.");
    }, Math.min(remaining, 2147483647));
  }

  async function connectWithToken(
    token: string,
    expiresAt: number
  ) {
    disconnect();

    const account = connectExistingAccount({
      uri:
        process.env.EXPO_PUBLIC_SPACETIMEDB_URI ??
        "wss://maincloud.spacetimedb.com",
      database:
        process.env.EXPO_PUBLIC_SPACETIMEDB_DATABASE ??
        "hackutd-demo",
      idToken: token,
      onDisconnect: () => {
        if (session.current !== account) return;

        clearTimeout(expiry.current);
        session.current = null;
        setConnection(null);
        setError("Your connection ended. Please sign in again.");
      },
    });

    session.current = account;

    try {
      const connected = await account.ready;

      if (session.current !== account) {
        account.dispose();
        return;
      }

      setConnection(connected);
      scheduleExpiry(account, expiresAt);
    } catch (cause) {
      if (session.current === account) {
        session.current = null;
        setConnection(null);
      }

      account.dispose();
      throw cause;
    }
  }

  // Load OpenID Connect configuration.
  useEffect(() => {
    if (!clientId) return;

    let active = true;

    AuthSession.fetchDiscoveryAsync(issuer)
      .then((value) => {
        if (active) setDiscovery(value);
      })
      .catch(() => {
        if (active) {
          setError(
            "Cannot reach sign-in. Check your connection and reload the app."
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["openid", "profile", "email"],
      usePKCE: true,
      extraParams: {
        prompt: "login",
        ...(email.trim()
          ? { login_hint: email.trim().toLowerCase() }
          : {}),
      },
    },
    clientId ? discovery : null
  );

  // Restore a previously saved session.
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const token = await getValue(TOKEN_KEY);
        const savedExpiry = await getValue(EXPIRY_KEY);

        if (!active || !token || !savedExpiry) return;

        const expiresAt = Number(savedExpiry);

        if (
          !Number.isFinite(expiresAt) ||
          expiresAt <= Date.now()
        ) {
          await clearSavedSession();
          return;
        }

        await connectWithToken(token, expiresAt);
      } catch (cause) {
        if (active) {
          await clearSavedSession();
          disconnect();
          console.warn("Session restoration failed:", cause);
        }
      } finally {
        if (active) setRestoring(false);
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Dispose of the connection when the provider unmounts.
  useEffect(() => {
    return () => {
      clearTimeout(expiry.current);
      session.current?.dispose();
      session.current = null;
    };
  }, []);

  async function signIn() {
    if (pending.current || restoring) return;

    if (!clientId) {
      setError(
        "Sign-in is not configured yet. Please contact the app team."
      );
      return;
    }

    if (!request || !discovery) {
      setError("Sign-in is still loading. Please try again.");
      return;
    }

    pending.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = await promptAsync();

      if (
        result.type === "cancel" ||
        result.type === "dismiss"
      ) {
        setError("Sign-in cancelled. Select Sign in to retry.");
        return;
      }

      if (
        result.type !== "success" ||
        !result.params.code ||
        !request.codeVerifier
      ) {
        throw new Error(
          "Sign-in could not be completed. Please try again."
        );
      }

      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          redirectUri,
          code: result.params.code,
          extraParams: {
            code_verifier: request.codeVerifier,
          },
        },
        discovery
      );

      if (!tokens.idToken) {
        throw new Error(
          "SpacetimeAuth did not return an ID token."
        );
      }

      const expiresAt =
        Date.now() + (tokens.expiresIn ?? 3600) * 1000;

      // Verify the account before saving the session.
      await connectWithToken(tokens.idToken, expiresAt);

      await saveValue(TOKEN_KEY, tokens.idToken);
      await saveValue(EXPIRY_KEY, String(expiresAt));
    } catch (cause) {
      disconnect();
      await clearSavedSession();

      const message =
        cause instanceof Error
          ? cause.message
          : "Sign-in failed. Please try again.";

      setError(
        message.includes("No account found")
          ? "No account found for this email."
          : message
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  // Keep the user profile synchronized with SpacetimeDB.
  useEffect(() => {
    if (!connection) {
      setUser(null);
      return;
    }

    const table = connection.db.myProfile;

    const updateUser = () => {
      setUser([...table.iter()][0] ?? null);
    };

    updateUser();

    table.onInsert(updateUser);
    table.onUpdate(updateUser);
    table.onDelete(updateUser);

    return () => {
      table.removeOnInsert(updateUser);
      table.removeOnUpdate(updateUser);
      table.removeOnDelete(updateUser);
    };
  }, [connection]);

  return (
    <Context.Provider
      value={{
        user: connection ? user : null,
        email,
        setEmail,
        busy: busy || restoring,
        error,
        connection,
        ready: !restoring && !!clientId && !!request && !!discovery,
        signIn,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSession() {
  const value = useContext(Context);

  if (!value) {
    throw new Error("SessionProvider is missing");
  }

  return value;
}
