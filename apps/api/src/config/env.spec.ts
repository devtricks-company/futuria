import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('applies local-development defaults', () => {
    const env = validateEnv({});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/futuria',
      AUTH_MODE: 'dev',
      WEB_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('switches to Clerk auth when a secret key is present', () => {
    expect(validateEnv({ CLERK_SECRET_KEY: 'sk_test_x' }).AUTH_MODE).toBe('clerk');
  });

  it('splits multiple web origins', () => {
    const env = validateEnv({ WEB_ORIGIN: 'http://a.test, https://b.test' });
    expect(env.WEB_ORIGINS).toEqual(['http://a.test', 'https://b.test']);
  });

  it('refuses dev auth in production and Clerk mode without keys', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/not allowed in production/);
    expect(() => validateEnv({ AUTH_MODE: 'clerk' })).toThrow(/requires CLERK_SECRET_KEY/);
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/Invalid environment/);
  });
});
