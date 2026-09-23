import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import ts from 'typescript';

it('loads the emitted capacity module in native Node ESM without a TypeScript loader', () => {
  const source = new URL('../packages/shared/catalogue-capacity.ts', import.meta.url);
  const json = new URL('../packages/shared/catalogue-limits.json', import.meta.url);
  const emitted = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const native = emitted.replace('./catalogue-limits.json', json.href) + '\nconsole.log(JSON.stringify(catalogueCapacity(51200000, 1)));';
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', native], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  expect(JSON.parse(output)).toMatchObject({ maxBytes: 64000000, maxRows: 50000, nearLimit: true });
});
