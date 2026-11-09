export const checks = {
  independentReview: 'Record the independent review for this release.',
  verifiedContracts: 'Verify deployed addresses, runtime bytecode and published source.',
  productionAttester: 'Verify the configured production attester.',
  exactReplay: 'Rehearse the exact approved calldata and funding against the intended factory.',
  allInQuote: 'Obtain a current execution, posting and USD estimate for the same call.',
} as const;

type Check = keyof typeof checks;
export type ReleaseEvidence = Partial<Record<Check, { release: string; reference: string; validUntil?: number }>>;

export function releaseGate(release?: string, evidence: ReleaseEvidence = {}, now = Date.now()) {
  const results = (Object.keys(checks) as Check[]).map(check => {
    const proof = evidence[check];
    return { check, passed: Boolean(release && proof?.release === release && proof.reference.trim() &&
      (check !== 'allInQuote' || (proof.validUntil && proof.validUntil > now))),
      reason: checks[check] };
  });
  return { allowed: results.every(result => result.passed), checks: results };
}

// The preview publishes no production deployment records and accepts no release evidence over HTTP.
export const previewGate = (review?: ReleaseEvidence["independentReview"]) =>
  releaseGate(review?.release, { independentReview: review });
