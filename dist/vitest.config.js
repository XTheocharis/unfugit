import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 10000,
        hookTimeout: 10000,
        isolate: true,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        setupFiles: [],
        include: ['*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/**', 'dist/**', 'tests/**', '*.config.*', 'test-*.sh'],
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map