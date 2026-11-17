import { databaseName, isMongoUri, withDatabase } from './mongo-uri.js';

const ATLAS = 'mongodb+srv://app:p%40ss@cluster0.ab12c.mongodb.net/?retryWrites=true&w=majority';

describe('mongo-uri', () => {
  it('reads the database name from local and Atlas strings', () => {
    expect(databaseName('mongodb://127.0.0.1:27017/futuria')).toBe('futuria');
    expect(databaseName('mongodb://127.0.0.1:27017')).toBeUndefined();
    expect(databaseName(ATLAS)).toBeUndefined();
    expect(databaseName(ATLAS.replace('/?', '/futuria?'))).toBe('futuria');
    expect(databaseName('mongodb://a:1,b:2/futuria?replicaSet=rs0')).toBe('futuria');
  });

  it('swaps the database and keeps credentials, hosts and options', () => {
    expect(withDatabase(ATLAS, 'futuria_test_1')).toBe(
      'mongodb+srv://app:p%40ss@cluster0.ab12c.mongodb.net/futuria_test_1?retryWrites=true&w=majority',
    );
    expect(withDatabase('mongodb://127.0.0.1:27017/futuria', 'other')).toBe(
      'mongodb://127.0.0.1:27017/other',
    );
    expect(withDatabase('mongodb://127.0.0.1:27017/', 'x')).toBe('mongodb://127.0.0.1:27017/x');
  });

  it('rejects strings that are not MongoDB connection strings', () => {
    expect(isMongoUri(ATLAS)).toBe(true);
    expect(isMongoUri('https://cluster0.mongodb.net/futuria')).toBe(false);
    expect(isMongoUri('cluster0.mongodb.net')).toBe(false);
    expect(() => withDatabase('postgres://x/y', 'z')).toThrow(/connection string/);
  });
});
