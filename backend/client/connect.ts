import { DbConnection, tables } from "./module_bindings";

/** Framework-neutral: supply secure token storage from the mobile app. */
export function connectDashboard(options: {
  uri: string;
  database: string;
  token?: string;
  saveToken: (token: string) => void;
  onReady: (connection: DbConnection) => void;
  onError: (error: Error) => void;
}) {
  const connection = DbConnection.builder()
    .withUri(options.uri)
    .withDatabaseName(options.database)
    .withToken(options.token)
    .withAutomaticReconnect()
    .onConnect((_connection, _identity, token) => options.saveToken(token))
    .onConnectError((_context, error) => options.onError(error))
    .build();

  const subscription = connection
    .subscriptionBuilder()
    .onApplied(() => options.onReady(connection))
    .onError((context) =>
      options.onError(context.event ?? new Error("Subscription failed")),
    )
    .subscribe([
      tables.disaster,
      tables.organization,
      tables.myProfile,
      tables.visibleUsers,
      tables.visibleRequests,
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

  return {
    connection,
    // Register row callbacks once, outside onConnect. SDK replays after reconnect.
    dispose() {
      subscription.unsubscribe();
      connection.disconnect();
    },
  };
}

// Call only from a user action, once subscriptions are ready:
// await connection.reducers.assignResource({ requestId: 1n, resourceId: 1n, quantity: 2 });
// connection.db.visibleRequests.onInsert((_ctx, request) => updateDashboard());
// Read current rows using [...connection.db.visibleRequests.iter()].
// Reducer promises can fail; surface SenderError text to the operator.
// Never automatically retry a mutation whose outcome is unknown after disconnect.
