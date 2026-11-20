/*
 * Helpers for MongoDB connection strings, both local (`mongodb://`) and Atlas (`mongodb+srv://`).
 * Atlas hands out strings without a database name (`...mongodb.net/?retryWrites=true`). The driver
 * would then use a database called "test", so the API fills in its own default instead.
 */

/** Database used when the connection string doesn't name one. */
export const DEFAULT_DATABASE = 'futuria';

// scheme://[user:password@]host[:port][,host...] [/database] [?options]
const MONGO_URI = /^(mongodb(?:\+srv)?:\/\/[^/?#]+)\/?([^/?#]*)(\?[^#]*)?$/;

function split(uri: string) {
  const match = MONGO_URI.exec(uri);
  if (!match) return undefined;
  return { server: match[1] ?? '', database: match[2] ?? '', options: match[3] ?? '' };
}

export function isMongoUri(uri: string): boolean {
  return split(uri) !== undefined;
}

/** The database named in the connection string, or undefined when it names none. */
export function databaseName(uri: string): string | undefined {
  const database = split(uri)?.database;
  return database ? decodeURIComponent(database) : undefined;
}

/** The same connection string pointed at another database, keeping credentials and options. */
export function withDatabase(uri: string, database: string): string {
  const parts = split(uri);
  if (!parts) throw new Error('Not a mongodb:// or mongodb+srv:// connection string');
  return `${parts.server}/${encodeURIComponent(database)}${parts.options}`;
}
