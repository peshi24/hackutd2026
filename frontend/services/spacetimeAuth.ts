
import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

export const SPACETIME_AUTH_ISSUER = "https://auth.spacetimedb.com/oidc";
export const SPACETIME_AUTH_BYPASS_REDIRECT_URI = "neighboralert://callback";
export const SPACETIME_AUTH_SCOPES = ["openid", "profile", "email"];
export const SPACETIME_AUTH_CLIENT_ID =
  process.env.EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID?.trim() ?? "";

export function getSpacetimeRedirectUri(): string {
  if (Platform.OS === "web") {
    if (!__DEV__) {
      return "https://hackutd2026.vercel.app/callback";
    }

    return AuthSession.makeRedirectUri({
      path: "callback",
    });
  }

  return AuthSession.makeRedirectUri({
    scheme: "neighboralert",
    path: "callback",
  });
}

export const redirectUri = getSpacetimeRedirectUri();
export const authorizationSkipped =
  redirectUri === SPACETIME_AUTH_BYPASS_REDIRECT_URI;

export function getSpacetimeAuthConfig() {
  if (!SPACETIME_AUTH_CLIENT_ID) {
    return null;
  }

  return {
    clientId: SPACETIME_AUTH_CLIENT_ID,
    redirectUri,
    scopes: SPACETIME_AUTH_SCOPES,
  };
}
