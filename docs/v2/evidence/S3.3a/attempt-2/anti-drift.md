# The D3 counterexample, before and after the repair — S3.3a attempt 2

- Command: `node build/s3.3a-attempt2/d3-counterexample.mjs`
- Working directory: repository root
- Exit: 0
- What it does: it moves the two executing nodes the attempt-1 review moved —
  the heading regex inside `sectionsOf` and the first `CLAIM_VERBS` pattern —
  in an ignored copy under `build/`, leaves every `PINNED_*` copy alone, and asks
  two verifiers which one notices. No source file is touched.

```
the mutated copy still runs: --print-rules exited 0 and parsed

A. whole-file literal presence, the shipped attempt:
   /\b(?:added|add|included|inc… → found (green)
   /\b(?:removed|remove|cleared… → found (green)
   /\b(?:shortened|shorten|cond… → found (green)
   /\b(?:expanded|expand|elabor… → found (green)
   /^([A-Z][A-Za-z ]+):\s?(.*)$… → found (green)

B. executing-AST equality, the shipped repair:
   fields that disagree: headingPattern, claimVerbs[0] (red)

pristine tree: A green, B green
```

Verifier A is the assertion attempt 1 shipped: does the literal appear
anywhere in the whole file. Verifier B is what ships now: does the dump equal the
node that executes. A is green on a file whose executing rules have both moved —
that is the defect. B is green only on the pristine tree.
