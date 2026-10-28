import * as fs from 'node:fs';
import * as path from 'node:path';

// The academy suite runs with fork reuse (isolate:false), where vi.mock
// registrations leak across test files sharing a fork. test:academy therefore
// runs every vi.mock-using file in a separate isolated vitest pass. This guard
// fails when a file starts (or stops) using vi.mock without the package.json
// script being updated to match, which would reintroduce order-dependent flakes.
describe('vi.mock isolation conformance', () => {
    const academyDir = path.resolve('tests/academy');

    function mockUsingFiles(): string[] {
        return fs.readdirSync(academyDir)
            .filter(name => name.endsWith('.test.ts'))
            .filter(name => /^\s*vi\.mock\(/m.test(fs.readFileSync(path.join(academyDir, name), 'utf8')))
            .sort();
    }

    function isolatedScriptFiles(): string[] {
        const script = (JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { scripts: Record<string, string> })
            .scripts['test:academy'];
        const isolatedInvocation = script.split('VITEST_ISOLATE=1')[1] ?? '';
        return [...isolatedInvocation.matchAll(/tests\/academy\/([\w.-]+\.test\.ts)/g)].map(match => match[1]).sort();
    }

    function configExcludedFiles(): string[] {
        const config = fs.readFileSync(path.resolve('config/vite/academy.config.ts'), 'utf8');
        const list = config.match(/const MOCK_ISOLATED_TESTS = \[([^\]]+)\]/)?.[1] ?? '';
        return [...list.matchAll(/tests\/academy\/([\w.-]+\.test\.ts)/g)].map(match => match[1]).sort();
    }

    it('runs every vi.mock-using academy test file in the isolated pass', () => {
        const mocked = mockUsingFiles();
        expect(isolatedScriptFiles()).toEqual(mocked);
        expect(configExcludedFiles()).toEqual(mocked);
    });
});
