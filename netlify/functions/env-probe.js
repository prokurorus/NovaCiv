exports.handler = async function envProbeHandler() {
  const { FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DB_URL, FIREBASE_DATABASE_URL } =
    process.env;

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ok: true,
      hasServiceAccountJson: Boolean(FIREBASE_SERVICE_ACCOUNT_JSON),
      hasFirebaseDbUrl: Boolean(FIREBASE_DB_URL),
      hasFirebaseDatabaseUrl: Boolean(FIREBASE_DATABASE_URL),
    }),
  };
};
