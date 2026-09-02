/** Integration test: mock payload → buildDoc → docx blob (node). */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

execSync(
  'npx esbuild src/lib/normalize.ts src/lib/docbuild.ts --bundle --format=esm --platform=node --outdir=/tmp/if-test',
  { stdio: 'inherit' }
);
