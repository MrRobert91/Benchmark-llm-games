# Paper results and OpenRouter reproduction

The `/results` page pairs a Spanish, section-by-section reading of
[Pham et al., arXiv:2608.01193v1](https://arxiv.org/abs/2608.01193v1) with new OpenRouter
data contributed by [RustyRoboz](https://www.rustyrobozlabs.com).
The `/leaderboard` comparison page reuses the same campaign explorer, audit/replay tables
and complete contribution registry, with a gallery of all local comparison graphs. Its live
API statistics are labelled separately from the frozen research campaign.

## Source and figure provenance

All 16 pages of the supplied PDF were read, including the extended results, robustness
checks and references. Eleven figure images are cropped directly from that PDF; no plotted
values are estimated from pixels. `frontend/public/paper/figures.json` records the PDF hash,
figure numbers, pages and source URL. The original authors are credited beside each figure.

Explicit numerical references come from Figures 3 and 10, Tables 2, 3, 11–14 and the
associated text. Missing per-model reference values remain unavailable. The seven-model
trajectory roster, the five-checkpoint baseline and the expanded nine-checkpoint persona
roster are different samples and are described as such.

## Campaign and budget

Final campaign: 493 race cells across 11 requested routes, 489 admitted races, no
contaminated completed races, and four original infrastructure failures retained. It also
contains 574 task-audit outputs and 288 fixed-state queries. Conservatively accounted spend
is $3.555779162 (approximately €3.167732 at the recorded reference rate), including
$0.38210535 of unresolved upper-bound allowances. All 1,728 admitted opaque decisions
pass the independent raw-code/mapping check. The dataset does not generally reproduce the
published rates: absolute differences across the 15 Table 12 reference cells reach 64.6
percentage points. This discrepancy is reported rather than tuned away.

The pre-execution manifest lives in `docs/results/reproduction-20261005/manifest.json`.
Canonical V1.1 self-play covers all three private-risk treatments. Per risk, Opus and Sonnet
have two planned repetitions, Gemini 3 Flash has three, the lower-cost original routes and
Luna have six, Qwen has eight, and the two cheapest extensions have ten.

The API key is read from the environment only. Each HTTP attempt, including transport and
reasoning retries, reserves a worst-case allowance before transmission. Input tokens are
bounded by UTF-8 content bytes plus 1,024 template tokens; output is bounded by the actual
requested `max_tokens`. Provider `max_price` caps input/output tariffs and excludes per-request
charges. A further 10% reservation margin is used. Reservations are persisted before the
request, and uncertain/network-interrupted costs retain their whole allowance after restart.
An append-only JSONL journal is flushed and fsynced before transmission, then materialised
into `ledger.json` at phase completion. Resume replays the journal over that snapshot; an
incomplete last append cannot authorise a transmitted request. This avoids rewriting the
whole growing trace on every request while preserving the same conservative guard.
The shared operational ceiling is $5, below €5 at the recorded ECB reference rate of
1.1225 USD/EUR on 2026-10-02. This is an API-spend cap, not a card currency-conversion quote.

Every race, including contamination and failures, is visible in the contribution registry.
The ledger retains interrupted attempts, so resuming cannot silently reset spend. Windows
file-replacement failures are retained as failed attempts; writes now retry transient locks.
Completed race files are never re-executed on resume.
Publication independently verifies the raw final P/Q outputs against every decoded action
in admitted opaque races and readable fixed-state queries. An invalid response code or
mismatched stored action prevents export rather than silently producing a comparison.
The separately hashed supplement is fixed after reviewing the initial campaign, so it is
explicitly exploratory. It adds fresh-seed infrastructure recoveries, fully crossed live
context controls, and the N-player persona/rank comparison. It shares the same budget.

## Coverage and methodological boundaries

| Paper technique | Local implementation | Claim boundary |
|---|---|---|
| Two-player and N-player game | Existing versioned engine, identical published equations | Mechanics, not exact author prompts |
| Validity gate | 41 reconstructed atomic probes in six categories for every model | Different questions/sample from original 685-output Qwen audit |
| Equivalent wording/calculator/order | Direct questions plus three Qwen variants | Diagnostic; score format and semantic correctness separately |
| Disclosed-arithmetic race | Matched Qwen canonical/card seeds, three repeats × three risks | Same horizon within pair, disclosed four-row arithmetic, reconstructed card |
| Opaque representation | Eight reconstructed skins × P/Q mappings at identical fixed states, plus separately frozen live supplement | Fully crossed mappings; fixed-state and live-feedback contrasts analysed separately |
| Theory versus race behaviour | Published EGT anchors and model risk curves | Evolutionary population is not prompted self-play |
| First-five means | Player-level mean in rounds 1–5 | Figure 3 uses explicitly published rounded means only |
| Table 12 risk comparison | Mean of full-race player rates; race-cluster bootstrap | Same observable unit, smaller and unequal samples |
| HDBSCAN/t-SNE | Raw 15-feature sequences, fixed random seed, declared settings | No human data or author coordinates; embeddings cannot be overlaid as identical |
| Round profiles | Own/rival actions 1–5 and pre-round gaps 2–5 | Explicit plotting transform; local pooled mean depends on sample allocation |
| Rate distributions | Family-overlaid reflected Gaussian KDE, bandwidth 0.025, log density; also raw 10-point bins | Original bandwidth/human raw data unavailable; small-sample peaks depend on smoothing |
| Predictive drivers | Random forest and TreeSHAP on five pre-decision variables | Split by race; no inference when class/sample variation is insufficient |
| Population decision tree | 15 raw trajectory features; depth 4; five stratified race-grouped folds | Local roster has no humans and different class counts |
| Nested logistic risk fits | Risk-only, checkpoint-only, checkpoint × risk, same five-checkpoint roster | Report descriptive deviance/AIC and separation; no independent-decision p-value |
| N=3–5 and position | Two OpenAI routes, all risks, two repeats/cell; rank before action | Table 13 uses decision-pooled rates; rank and N are not random causal interventions |
| N-player persona bands | Same two routes, N=3–5, all risks and all six persona levels; one race/level/cell | Pool levels 1–2/3–4/5–6 as Tables 5–6; two levels per band are different prompts, not identical-condition repeats |
| Assigned persona | Qwen levels 1–6 crossed with private risk, two repeats/cell | Reconstructed wording, not an elicited human trait or exact author persona |
| Human-fit archetypes and regression refit | Explain and cite original figures/tables | No raw human dataset was obtained; no invented local human replication |

The OSF registration and linked original project were checked: the registration contains
experimental-design PDFs, and the original project's public file listing is empty. The
human paper's data/code availability section describes public deposition upon publication.
Consequently, published human figures are the reference here; no new human observations,
centroids or regression coefficients are fabricated.

## Rebuild and verify

```sh
cd backend
pip install -r requirements.txt -r tools/research-requirements.txt
python -m tools.reproduce_paper --out ../docs/results/reproduction-20261005 --workers 32
python -m tools.research_supplement --out ../docs/results/reproduction-20261005
python -m tools.export_research --out ../docs/results/reproduction-20261005
python -m pytest tests -q
cd ../frontend
npm test
npx tsc --noEmit
npm run build
```

Download `/research/reproduction-20261005.zip` and extract it into the campaign directory
before resuming or rebuilding: raw race, audit, replay and call files are compressed together
in that public archive. The standalone manifest/report remain in Git. The ZIP also includes
execution and analysis source. Runtime/library versions are in `analysis_packages`.

The live archive uses additive, idempotent research seeding on the next normal Docker
startup. Existing games and their provider traces are not overwritten. Compact provider
metadata seeds API counts/costs; complete prompts and responses are in the ZIP. The frozen
`/results` campaign remains separately inspectable as future user runs accumulate.
The nine historical smoke replays retain their original protocol. Their 128 provider-call
metadata records are preserved from the existing validation database ($0.001644934), so a
fresh snapshot or deployment also retains the original provider statistics and cost.

This is an exploratory methodological reconstruction. Neither a matching mean nor an
engine-admitted trajectory establishes task comprehension, human psychological equivalence,
general model safety, or a confirmatory reproduction of the original endpoints.
