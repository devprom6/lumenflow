import * as fs from 'node:fs';
import * as path from 'node:path';

const SECRET_PATTERNS = [
  { name: 'Stellar Ed25519 Secret Seed', regex: /\bS[A-Z0-9]{55}\b/ },
  { name: 'Private Key PEM', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP|ENCRYPTED|PRIVATE) KEY/ },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'Generic API Token',
    regex: /(api_key|apiKey|secret_key|secretKey)\s*[:=]\s*["'][a-zA-Z0-9_\-]{24,}["']/i,
  },
];

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  'test-results',
  'coverage',
]);

const IGNORE_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json']);

let violationsCount = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      // Skip test mocks or spec files where synthetic mock seeds are used intentionally
      if (
        fullPath.includes('__tests__') ||
        fullPath.endsWith('.spec.ts') ||
        fullPath.endsWith('.test.ts')
      ) {
        continue;
      }
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(content)) {
            // Check if it's an example file or placeholder
            if (
              fullPath.endsWith('.example') ||
              content.includes('replace_me_with_a_strong_random_secret')
            ) {
              continue;
            }
            console.error(`[SECRET SCAN DETECTED] ${pattern.name} in ${fullPath}`);
            violationsCount++;
          }
        }
      } catch {
        // Binary or unreadable
      }
    }
  }
}

console.log('Running secret scan across workspace...');
scanDir(process.cwd());

if (violationsCount > 0) {
  console.error(`FAILED: Found ${violationsCount} potential secret leaks.`);
  process.exit(1);
} else {
  console.log('PASSED: No unencrypted secrets or private keys detected.');
}
