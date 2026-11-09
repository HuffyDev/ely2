import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function recordedReview() {
  try {
    const cwd = new URL('.', import.meta.url);
    const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (git(['status', '--porcelain', '--untracked-files=no'])) return undefined;
    const commit = git(['rev-parse', 'HEAD']);
    if (!/^[a-f0-9]{40}$/.test(commit)) return undefined;
    const record = JSON.parse(readFileSync(new URL('./work/reviews/' + commit + '.json', cwd), 'utf8'));
    if (record.reviewedCommit !== commit || !/^[a-f0-9]{64}$/.test(record.sha256) ||
        !Number.isFinite(Date.parse(record.recordedAt))) return undefined;
    return { release: commit, reference: record.sha256 as string };
  } catch {
    return undefined;
  }
}
