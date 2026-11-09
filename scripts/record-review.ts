import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';

const [reviewFile, reviewedCommit] = process.argv.slice(2);
if (!reviewFile || !/^[a-f0-9]{40}$/.test(reviewedCommit ?? '') || !process.stdin.isTTY) {
  throw Error('Usage: npm run review:record -- <independent-review-file> <reviewed-commit>');
}
execFileSync('git', ['cat-file', '-e', reviewedCommit + '^{commit}']);
const review = await readFile(reviewFile);
if (!review.length) throw Error('The review file is empty.');
const sha256 = createHash('sha256').update(review).digest('hex');
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  const phrase = 'RECORD REVIEW ' + reviewedCommit;
  if (await terminal.question('Review SHA-256 ' + sha256 + '\nType ' + phrase + ' to record it: ') !== phrase) {
    throw Error('Review was not recorded.');
  }
  await mkdir('work/reviews', { recursive: true });
  await writeFile('work/reviews/' + reviewedCommit + '.json',
    JSON.stringify({ reviewedCommit, sha256, recordedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  console.log('Review recorded locally. The preview remains locked.');
} finally {
  terminal.close();
}
