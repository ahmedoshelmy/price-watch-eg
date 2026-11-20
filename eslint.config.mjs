import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

/**
 * Lint for the Node services and libs (the web app has its own config). The boundaries rule enforces the
 * Clean Architecture dependency rule inside each service: domain <- application <- infrastructure/presentation.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'apps/web/**',
      '*.config.js',
      'jest.setup.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // No consistent-type-imports: Nest DI reads constructor parameter types at runtime (emitDecoratorMetadata).
      'no-console': 'error',
    },
  },
  {
    files: ['apps/*/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['apps/*/src/**/*.ts'],
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      'boundaries/elements': [
        { type: 'domain', pattern: 'apps/*/src/**/domain/**' },
        { type: 'application', pattern: 'apps/*/src/**/application/**' },
        { type: 'infrastructure', pattern: 'apps/*/src/**/infrastructure/**' },
        { type: 'presentation', pattern: 'apps/*/src/**/presentation/**' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'domain' } },
              disallow: { to: { element: { types: ['application', 'infrastructure', 'presentation'] } } },
              message: 'The domain layer must not depend on outer layers',
            },
            {
              from: { element: { type: 'application' } },
              disallow: { to: { element: { types: ['infrastructure', 'presentation'] } } },
              message: 'The application layer depends only on the domain and its own ports',
            },
            {
              from: { element: { type: 'infrastructure' } },
              disallow: { to: { element: { type: 'presentation' } } },
              message: 'Infrastructure must reach presentation through an application port',
            },
          ],
        },
      ],
    },
  },
  {
    // The domain is plain TypeScript: no framework, ORM, broker or transport imports.
    files: ['apps/*/src/**/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'typeorm', 'pg', 'amqplib', '@grpc/*', 'socket.io', 'express'],
              message: 'Keep the domain framework-free.',
            },
            {
              group: ['@price-watch/platform', '@price-watch/platform/*'],
              message: 'Keep the domain framework-free.',
            },
          ],
        },
      ],
    },
  },
)
