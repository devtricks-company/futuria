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

  it('accepts Atlas connection strings and defaults the database to futuria', () => {
    const atlas =
      'mongodb+srv://app:secret@cluster0.ab12c.mongodb.net/?retryWrites=true&w=majority';
    expect(validateEnv({ MONGODB_URI: atlas }).MONGODB_URI).toBe(
      'mongodb+srv://app:secret@cluster0.ab12c.mongodb.net/futuria?retryWrites=true&w=majority',
    );
    const named = 'mongodb+srv://app:secret@cluster0.ab12c.mongodb.net/staging?w=majority';
    expect(validateEnv({ MONGODB_URI: named }).MONGODB_URI).toBe(named);
    expect(() => validateEnv({ MONGODB_URI: 'cluster0.ab12c.mongodb.net' })).toThrow(
      /mongodb\+srv:\/\//,
    );
  });

  it('switches to Clerk auth when a secret key is present', () => {
    expect(validateEnv({ CLERK_SECRET_KEY: 'sk_test_x' }).AUTH_MODE).toBe('clerk');
  });

  it('splits multiple web origins', () => {
    const env = validateEnv({ WEB_ORIGIN: 'http://a.test, https://b.test' });
    expect(env.WEB_ORIGINS).toEqual(['http://a.test', 'https://b.test']);
  });

  it('uses fixture AI and the inline pipeline until credentials are configured', () => {
    expect(validateEnv({})).toMatchObject({
      AI_MODE: 'fixture',
      PIPELINE_MODE: 'inline',
      AI_MODEL: 'claude-opus-5-5',
      AI_REFUSAL_FALLBACK: true,
      AI_PROMPT_CACHE: true,
      INNGEST_DEV: false,
    });
  });

  it('switches to real Claude with a key or token, optionally through a gateway', () => {
    expect(validateEnv({ ANTHROPIC_API_KEY: 'sk-ant-x' }).AI_MODE).toBe('anthropic');
    const gateway = validateEnv({
      ANTHROPIC_AUTH_TOKEN: 'tok',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/',
      AI_REFUSAL_FALLBACK: 'false',
      AI_PROMPT_CACHE: '0',
    });
    expect(gateway).toMatchObject({
      AI_MODE: 'anthropic',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com',
      AI_REFUSAL_FALLBACK: false,
      AI_PROMPT_CACHE: false,
    });
    expect(validateEnv({ ANTHROPIC_API_KEY: '  ' }).AI_MODE).toBe('fixture');
    expect(() => validateEnv({ AI_MODE: 'anthropic' })).toThrow(/requires ANTHROPIC_API_KEY/);
    expect(() => validateEnv({ ANTHROPIC_BASE_URL: 'not a url' })).toThrow(/Invalid environment/);
    expect(() => validateEnv({ AI_PROMPT_CACHE: 'maybe' })).toThrow(/true, false, 1 or 0/);
  });

  it('uses Inngest with the Dev Server or cloud keys', () => {
    expect(validateEnv({ INNGEST_DEV: '1' }).PIPELINE_MODE).toBe('inngest');
    expect(
      validateEnv({ INNGEST_EVENT_KEY: 'evt', INNGEST_SIGNING_KEY: 'signkey-x' }).PIPELINE_MODE,
    ).toBe('inngest');
    expect(() => validateEnv({ PIPELINE_MODE: 'inngest' })).toThrow(/INNGEST_DEV=1/);
  });

  it('refuses development shortcuts in production', () => {
    const prod = { NODE_ENV: 'production', CLERK_SECRET_KEY: 'sk_live_x' };
    expect(() => validateEnv(prod)).toThrow(/AI_MODE=fixture is not allowed/);
    expect(() => validateEnv({ ...prod, ANTHROPIC_API_KEY: 'k' })).toThrow(
      /PIPELINE_MODE=inline is not allowed/,
    );
    const ok = validateEnv({
      ...prod,
      ANTHROPIC_API_KEY: 'k',
      INNGEST_EVENT_KEY: 'evt',
      INNGEST_SIGNING_KEY: 'signkey-x',
    });
    expect(ok).toMatchObject({
      AUTH_MODE: 'clerk',
      AI_MODE: 'anthropic',
      PIPELINE_MODE: 'inngest',
    });
  });

  it('refuses dev auth in production and Clerk mode without keys', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/not allowed in production/);
    expect(() => validateEnv({ AUTH_MODE: 'clerk' })).toThrow(/requires CLERK_SECRET_KEY/);
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/Invalid environment/);
  });
});
