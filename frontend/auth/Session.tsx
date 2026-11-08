import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { connectExistingAccount } from "../../backend/client/login";
import type { AccountProfile } from "../../backend/client/module_bindings/types";

WebBrowser.maybeCompleteAuthSession();
const issuer = "https://auth.spacetimedb.com/oidc";
const clientId = process.env.EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID ?? "";
export const redirectUri = AuthSession.makeRedirectUri({ scheme: "neighboralert", path: "callback" });
type AccountSession = ReturnType<typeof connectExistingAccount>;
type AuthState = {
  user: AccountProfile | null;
  email: string;
  setEmail: (email: string) => void;
  busy: boolean; ready: boolean; error: string | null;
  connection: AccountSession["connection"] | null;
  signIn: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountProfile | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(clientId ? null : "Sign-in is not configured yet. Please contact the app team.");
  const [connection, setConnection] = useState<AccountSession["connection"] | null>(null);
  const session = useRef<AccountSession | null>(null);
  const pending = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [discovery, setDiscovery] = useState<AuthSession.DiscoveryDocument | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    AuthSession.fetchDiscoveryAsync(issuer).then(value => {
      if (active) setDiscovery(value);
    }).catch(() => {
      if (active) setError("Cannot reach sign-in. Check your connection and reload the app.");
    });
    return () => { active = false; };
  }, []);
  const [request, , promptAsync] = AuthSession.useAuthRequest({
    clientId, redirectUri, responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "profile", "email"], usePKCE: true,
    extraParams: { prompt: "login", ...(email.trim() ? { login_hint: email.trim().toLowerCase() } : {}) },
  }, clientId ? discovery : null);

  useEffect(() => () => {
    session.current?.dispose();
    clearTimeout(expiry.current);
  }, []);

  async function signIn() {
    if (pending.current) return;
    if (!clientId) { setError("Sign-in is not configured yet. Please contact the app team."); return; }
    if (!request || !discovery) { setError("Sign-in is still loading. Please try again."); return; }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      // Called directly from the button so browsers can open the auth popup.
      const result = await promptAsync();
      if (result.type === "cancel" || result.type === "dismiss") {
        setError("Sign-in cancelled. Select Sign in to retry."); return;
      }
      if (result.type !== "success" || !result.params.code || !request.codeVerifier)
        throw new Error("Sign-in could not be completed. Please try again.");
      const tokens = await AuthSession.exchangeCodeAsync({
        clientId, redirectUri, code: result.params.code,
        extraParams: { code_verifier: request.codeVerifier },
      }, discovery);
      if (!tokens.idToken) throw new Error("SpacetimeAuth did not return an ID token.");
      session.current?.dispose();
      const account = connectExistingAccount({
        uri: process.env.EXPO_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com",
        database: process.env.EXPO_PUBLIC_SPACETIMEDB_DATABASE ?? "hackutd-demo",
        idToken: tokens.idToken,
        onDisconnect: () => {
          setConnection(null);
          setError("Your connection ended. Please sign in again.");
        },
      });
      session.current = account;
      const connected = await account.ready; // Backend verifies email/account/role.
      setConnection(connected);
      clearTimeout(expiry.current);
      expiry.current = setTimeout(() => {
        account.dispose();
        setConnection(null);
        setError("Your session expired. Please sign in again.");
      }, Math.max(0, Math.min(tokens.expiresIn ?? 3600, 86400)) * 1000);
    } catch (cause) {
      session.current?.dispose();
      session.current = null;
      setConnection(null);
      const message = cause instanceof Error ? cause.message : "Sign-in failed. Please try again.";
      setError(message.includes("No account found") ? "No account found for this email." : message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!connection) { setUser(null); return; }
    const table = connection.db.myProfile;
    const updateUser = () => setUser([...table.iter()][0] ?? null);
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

  return <Context.Provider value={{ user: connection ? user : null, email, setEmail, busy, error, connection,
    ready: !!clientId && !!request && !!discovery, signIn }}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
