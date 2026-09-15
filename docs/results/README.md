# Validation artifacts

These files are committed evidence for Moloch Arena V1. They contain aggregate results and
reproducibility metadata only; raw prompts, model responses and reasoning remain in the
private local SQLite database and are deliberately excluded from Git.

## OpenRouter smoke run

- Manifest: `openrouter-smoke-manifest.json`
- Machine-readable report: `openrouter-smoke-report.json`
- Human-readable report: `openrouter-smoke-report.html`
- Local raw database: `backend/data/moloch-v1-validation-final.db` (gitignored)
- Date: 2026-09-15
- Models: `mistralai/mistral-nemo`, `qwen/qwen3.7-flash`,
  `amazon/nova-micro-v1`
- Design: self-play, two players, one race for each model at risks 0.10, 0.60 and 0.90
- Outcome: 9/9 completed and admitted; 128 final decisions; 18 terminal player results
- OpenRouter cost for the final clean run: 0.001644934 USD against a 1.00 USD guard
- Secret check: the environment API key was not present in the database bytes

This is a diagnostic smoke test with one race per cell. It demonstrates transport, parser,
budget, persistence, analysis and replay integration; it is not enough to estimate model
behaviour. The frozen confirmatory preset uses ten races per model-risk cell.

OpenRouter returned temporary HTTP 429 responses during earlier diagnostic attempts. The
runner now applies bounded retries, isolates failed cells, resumes without duplicating
completed cells and persists unsuccessful provider attempts in the private trace with a zero
reported cost.

## Evolutionary anchor

`evolutionary-v1-seed1.json` contains the full four-strategy payoff/action matrices and the
EGTtools finite-population estimates for the three risk treatments. It uses 10,000 simulated
races for every ordered conditional-strategy matchup, population 100, beta 2, mutation 0.02,
eight numerical runs and one million generations. The frozen absolute tolerance is 0.03.

All three published UNSAFE anchors are reproduced within tolerance. See
`docs/REPRODUCIBILITY.md` for the claim boundary: this validates P0/P1 and the published P2
reconstruction, but it does not remove the P3 blocker created by unavailable author prompts,
probes, raw data and code.
