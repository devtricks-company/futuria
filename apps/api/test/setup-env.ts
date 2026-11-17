/*
 * Runs before each e2e test file: point the app at a throwaway database on the local MongoDB
 * (or MONGODB_TEST_URI in CI) and use dev auth. Each file gets its own database, which the
 * file drops when it finishes.
 */
const base = (process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

process.env.MONGODB_URI = `${base}/futuria_test_${suffix}`;
process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'dev';
