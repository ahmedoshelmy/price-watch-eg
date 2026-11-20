/** Unit tests sit next to the code (*.spec.ts); integration tests need Docker (tests/integration/*.int-spec.ts). */
const swc = [
  '@swc/jest',
  {
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      target: 'es2022',
    },
    module: { type: 'commonjs' },
  },
]

const shared = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': swc },
  moduleNameMapper: {
    '^@price-watch/contracts$': '<rootDir>/libs/contracts/src',
    '^@price-watch/platform$': '<rootDir>/libs/platform/src',
    '^@price-watch/platform/telemetry$': '<rootDir>/libs/platform/src/telemetry',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
}

module.exports = {
  projects: [
    { ...shared, displayName: 'unit', testMatch: ['<rootDir>/apps/*/src/**/*.spec.ts', '<rootDir>/libs/*/src/**/*.spec.ts'] },
    { ...shared, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.int-spec.ts'] },
  ],
}
