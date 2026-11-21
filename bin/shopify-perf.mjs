#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { run } from '../src/cli.mjs';

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = await run({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr,
    readFile: (path) => readFile(path, 'utf8')
  });
}
