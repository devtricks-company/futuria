import base from '@futuria/config/eslint';

export default [
  ...base,
  {
    rules: {
      // Nest dependency injection reads constructor parameter types at runtime
      // (emitDecoratorMetadata), so injected classes must be value imports.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
