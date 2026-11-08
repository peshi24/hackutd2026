import { DbConnection, tables } from "./module_bindings";

/** Call after SpacetimeAuth's OIDC flow. Never pass a frontend-provided email. */
export function connectExistingAccount(options: {
  uri: string;
  database: string;
  idToken: string;
  onDisconnect?: (error?: Error) => void;
}) {
  if (!options.idToken) throw new Error("Sign in with SpacetimeAuth first");
  let resolveReady!: (connection: DbConnection) => void;
  let rejectReady!: (error: Error) => void;
  let closed = false;
  const ready = new Promise<DbConnection>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const timeout = setTimeout(
    () => fail(new Error("Login connection timed out")),
    30000,
  );
  const connection = DbConnection.builder()
    .withUri(options.uri)
    .withDatabaseName(options.database)
    .withToken(options.idToken)
    .onConnect((conn) => {
      void conn.reducers
        .loginExistingUser({})
        .then(() => {
          if (closed) return;
          conn
            .subscriptionBuilder()
            .onApplied(() => {
              if (closed) return;
              if ([...conn.db.myProfile.iter()].length !== 1) {
                fail(new Error("No account found for this email."));
                return;
              }
              clearTimeout(timeout);
              resolveReady(conn);
            })
            .onError((ctx) =>
              fail(ctx.event ?? new Error("Account subscription failed")),
            )
            .subscribe([
              tables.myProfile,
              tables.disaster,
              tables.organization,
              tables.visibleRequests,
              tables.visibleUsers,
              tables.visibleResources,
              tables.visibleAssignments,
              tables.myMessages,
              tables.visibleIntakeSessions,
              tables.visibleIntakeMessages,
              tables.visibleRequestReviews,
              tables.visibleUserLocations,
              tables.myOutreachPreference,
              tables.visibleBroadcasts,
              tables.visibleBroadcastDeliveries,
            ]);
        })
        .catch((error) =>
          fail(error instanceof Error ? error : new Error(String(error))),
        );
    })
    .onConnectError((_ctx, error) => fail(error))
    .onDisconnect((_ctx, error) => {
      clearTimeout(timeout);
      rejectReady(error ?? new Error("Disconnected"));
      if (!closed) options.onDisconnect?.(error);
    })
    .build();
  function fail(error: Error) {
    clearTimeout(timeout);
    rejectReady(error);
    closed = true;
    connection.disconnect();
  }
  return {
    connection,
    ready,
    dispose() {
      closed = true;
      clearTimeout(timeout);
      rejectReady(new Error("Login connection closed"));
      connection.disconnect();
    },
  };
}
