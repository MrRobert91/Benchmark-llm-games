# Moloch Arena Paper Draft

> **Nota de uso (ES).** Este es el esqueleto del paper, redactado en inglés porque es el idioma de
> destino (AAMAS / NeurIPS D&B / arXiv cs.MA). Las secciones marcadas **[WRITTEN]** están redactadas
> y sirven casi tal cual. Las marcadas **[SCAFFOLD]** tienen la estructura, el argumento y las
> decisiones metodológicas fijadas, pero necesitan los números de los experimentos. Las marcadas
> **[TODO]** indican dónde hace falta trabajo de investigación adicional, y qué trabajo es.
> Ver `docs/analisis-tres-papers-y-ampliacion.md` para la justificación de cada decisión.

---

**Working title:**
*Moloch Arena: Communication, Externalities and Exogenous Position in Multi-Agent AI Development Races*

**Alternative titles:**
- *Talking Their Way to the Bottom: Cheap Talk and Collective Risk in LLM AI Races*
- *Promises Under Pressure: What Falling Behind Does to Agent Honesty*

**Target venues (in order):** AAMAS (full paper) · NeurIPS Datasets & Benchmarks · ICML workshop on
Multi-Agent Systems · arXiv cs.MA/cs.AI preprint first.

---

## Abstract **[SCAFFOLD]**

*Structure (six sentences, fill the bracketed slots with results):*

1. **Setup.** Idealised AI development races are the standard formal model for the speed–safety
   trade-off, and recent work has run them with human participants and with LLM agents.
2. **Gap.** Both keep three things fixed that matter in the real competition they model: risk is
   *private*, agents cannot *talk*, and race position is *observed rather than assigned*.
3. **What we do.** We introduce Moloch Arena, an auditable multi-agent race environment that (i)
   varies risk incidence between private setback and collective catastrophe, (ii) adds a
   communication ladder from silence through non-binding pledges to engine-enforced commitments,
   with abstention as a first-class action, and (iii) **randomises starting position**, giving an
   exogenous handle on the "falling behind" effect.
4. **Method.** Every behavioural claim passes a validity gate adapted from Pham et al., extended
   from a one-off entrance check to a *continuous* in-game state-tracking covariate.
5. **Findings.** [X models, Y races, Z decisions. Headline result. Second result. The
   counterintuitive one if it survives.]
6. **Scope.** Findings are exploratory and scoped to the tested checkpoints, prompts and decoding
   contracts; `safe`/`unsafe` are labels of in-game actions, not measurements of model safety.

*Write the abstract last. Do not write it before the results exist.*

---

## 1. Introduction **[WRITTEN — needs the contribution bullets filled in]**

Competition over advanced AI is widely argued to push developers toward speed at the expense of
safety. The claim is stated plainly in the Science consensus paper of Bengio et al.: without
breakthroughs in safety research, "developers must either risk creating unsafe systems or falling
behind competitors who are willing to take more risks," and firms and states "may seek a competitive
edge by pushing AI capabilities to new heights while cutting corners on safety."

This claim has a formal model — the idealised AI race of Han et al. — and, recently, two empirical
instantiations. Fernández Domingos and Han ran it as a framed behavioural experiment with 338 human
participants. Pham et al. reproduced the same mechanism with frontier LLM agents and extended it to
three-to-five-player races. Together they establish two things we take as given. First, in humans,
unsafe development is driven not by risk preferences or by the risk level but by the *evolving
strategic state* of the race: the opponent's previous action, relative position, and the first-round
choice. Second, in LLMs, aggregate behavioural similarity to humans is uninformative — models that
match the human mean unsafe rate occupy narrow, model-specific regions of trajectory space, while
humans cover it entirely.

Both studies also, deliberately, hold three things fixed, and each of the three is load-bearing in
the real competition the model is meant to represent.

**Risk is private.** Only the race winner is exposed to a setback, and it costs only that player.
Fernández Domingos and Han name this as a limitation: "many real safety failures impose
externalities on other actors or on society more broadly." An unaligned frontier system is the
paradigm case of an externality, and whether the trap tightens or loosens when the downside is
shared is an open empirical question.

**Agents cannot talk.** Real AI development happens amid public commitments, safety pledges,
summits and declarations. A race model in which the only channel is the action itself cannot
represent the central governance instrument that is actually being tried. And the direction of the
effect is not obvious: communication may enable coordination, or it may simply let competitors
signal aggressive intent sooner.

**Position is observed, not assigned.** Pham et al. flag this explicitly as unresolved: because
unsafe play mechanically produces more progress, a player who is unsafe is more likely to *be* the
leader, so any association between rank and subsequent action confounds selection with causation.
They state that separating the two "would require conditioning on, or randomising, prior own-action
history within rank," and leave it as a concrete next step.

We take up all three.

**Contributions.**

- **C1.** *Moloch Arena*, an open, auditable environment for N-player AI development races with a
  replication mode that reproduces the published two-player mechanism exactly, validated by
  refitting the published human coefficient vector. **[TODO: report the refit error, targeting the
  ≤0.002 achieved by Pham et al.]**
- **C2.** The first *exogenous* estimate of the falling-behind effect, via randomised starting
  position. **[TODO: result]**
- **C3.** A communication ladder — silence, cheap talk, non-binding pledge, public integrity
  ledger, sanctioned commitment, engine-enforced commitment — with **abstention as a first-class
  action**, and the measurement apparatus that abstention requires. **[TODO: result]**
- **C4.** A comparison of private-setback and collective-catastrophe risk regimes under otherwise
  identical mechanics. **[TODO: result]**
- **C5.** A methodological extension of the validity gate from a one-off entrance check to a
  *continuous, in-game* covariate, letting us separate late-game strategic shift from late-game
  state-tracking drift. **[TODO: result]**

---

## 2. Related work **[SCAFFOLD — subsections and the differentiation argument are fixed]**

**2.1 Idealised AI development races.** Han, Pereira, Santos and Lenaerts (JAIR 2020) and the
follow-on work on voluntary safety commitments, heterogeneous settings, and regulation. State the
parameters we inherit (`b=4, c=1, s=1.5`) and the N-player count-based payoff rule.

**2.2 Behavioural and LLM instantiations.** Fernández Domingos & Han (2026) — human benchmark, the
four-strategy reduced model, the null pre-registered hypotheses and the exploratory dynamic
findings. Pham et al. (2026) — the audit-first protocol, the trajectory-level analysis, the extreme-
policy finding.

**2.3 Cheap talk and promise-breaking in LLM agents. ⚠ CLOSEST PRIOR WORK — differentiate here,
explicitly, in the first paragraph of the subsection.** *Cheap Talk, Empty Promise* (2026) measures
public announcement followed by private action across six canonical normal-form games and nine
frontier models, finding ~56.6% promise-breaking and classifying deviations as win-win, selfish,
altruistic and sabotaging — frequently without verbalised awareness. *When Agents Lie* (2026)
extends deception analysis to repeated play.

*Our differentiation, stated plainly:* these works establish **that** agents break promises and
**how often**. Their games are one-shot and stateless, so the deviation cannot be conditioned on
anything. Our race carries endogenous state — accumulated progress, accumulated risk, an observable
relative position — which lets us ask the question their design cannot pose: **does honesty depend
on whether you are winning?** We adopt their four-type deviation taxonomy rather than inventing one,
and add position-conditioning on top of it.

**2.4 Mechanisms for sustaining cooperation.** CoopEval (ICML 2026): repetition, reputation,
mediation, contracts; stronger-reasoning models cooperate less; contracting and mediation dominate;
repetition-induced cooperation collapses when co-players vary. This last finding grounds our mixed-
pool hypothesis (H6).

**2.5 Multi-turn degradation.** *When Attention Closes*, *Drift No More?*, *Lost in the Middle*.
Grounds the long-horizon condition and the continuous audit. Note the tension: *Drift No More?*
finds noise-limited equilibria rather than runaway degradation — do not overclaim.

**2.6 Governance instruments.** Bengio et al. (Science 2024) as the source of the treatment menu,
not as evidence.

---

## 3. The game **[WRITTEN — this section is ready modulo notation]**

### 3.1 Base mechanism (replication mode)

`N` players. Each round `t`, every player simultaneously and secretly chooses `a_i^t ∈ {S, U}`.
Progress accrues as `P_i^t = P_i^{t-1} + σ(a_i^t)` with `σ(S) = 1`, `σ(U) = s = 1.5`.

Stage payoffs follow the count-based rule with `k^t` players choosing Safe and
`D = k^t + s(N − k^t)`:

```
π_Safe(k)   = b/D − c
π_Unsafe(k) = s·b/D          with b = 4, c = 1, s = 1.5
```

At `N = 2` this collapses to the fixed matrix `[[1.0, 0.6], [2.4, 2.0]]`.

The race runs a minimum of 5 rounds and then terminates with probability `p = 0.2` after each
completed round, so `T = 5 + G`, `G ~ Geom(0.2) − 1`, `E[T] = 9`. **The horizon is never disclosed
and is not capped**, so no player can condition on knowing the round is the last.

At termination, prize `B = 100` goes to the highest cumulative progress, split evenly among ties.

**Note on the stage game (worth a remark box).** In standard notation the `N = 2` matrix gives
`T = 2.4 > P = 2.0 > R = 1.0 > S = 0.6`. This is a **Deadlock**, not a Prisoner's Dilemma: mutual
Unsafe beats mutual Safe at the stage level. The social dilemma is created entirely by the terminal
risk, and only once `p_r^max > 1 − 59/68 ≈ 0.132`. Any implementation that copies the matrix without
the terminal lottery is measuring a game in which racing is collectively optimal.

### 3.2 Risk regimes **[NEW — factor RISK]**

| | Incidence | Accumulation |
|---|---|---|
| **Private** (replication) | winner / tied winners only; the loser is never exposed | `q_i = p_r^max · n_i^U(T)/T` |
| **Collective** (ours) | all players, regardless of outcome | same, evaluated on the crosser |
| **Mixed** | winner loses everything, others lose a fraction `λ` | same |

Under private incidence a setback zeroes the affected player's entire race payoff including the
prize. Under collective incidence all players receive the catastrophe payoff. The maximum risk
`p_r^max ∈ {0.1, 0.6, 0.9}` is the treatment inherited from the human study.

**Design note to keep in the paper:** *fraction* accumulation means late Safe play dilutes
accumulated risk; a *count* rule makes risk a ratchet. We use fraction throughout for
comparability and report count as a robustness condition.

### 3.3 The communication ladder **[NEW — factor COMM]**

| Level | Meeting phase | Pledge | Enforcement |
|---|---|---|---|
| **C0** | none | — | — |
| **C1** | one free-text turn each | none | — |
| **C2** | one turn each | structured, public | none (cheap talk) |
| **C3** | `k ∈ {1,2,3}` turns each | structured, public | none |
| **C4** | as C2 | structured | public integrity ledger visible to all |
| **C5** | as C2 | structured | breaking costs a sanction |
| **C6** | as C2 | structured, pre-registered | **engine-enforced** |

C0 is the replication anchor and is run in every configuration.

**Abstention.** In every level with a meeting phase, the meeting action is

```
meeting_action ∈ { SPEAK(text, pledge), SPEAK(text, NO_PLEDGE), ABSTAIN }
```

Abstention is not a null option: an agent that never lies but falls silent exactly when it intends
to defect is strategically equivalent to one that lies, and is scored as perfectly honest by a naive
integrity metric. Section 5 defines the measures that close this hole.

### 3.4 Exogenous position **[NEW — factor POS] ⭐**

Before round 1, each player receives a starting progress handicap `h_i` drawn from a declared
distribution and independent of anything the player does. Optionally, a mid-race position shock
re-randomises the gap at a pre-specified round.

This is the design's main causal lever. In the published studies rank is measured immediately
before the action, so a player's own propensity to play unsafe and its current rank are entangled
through the mechanism itself (`σ(U) > σ(S)`). Randomising the handicap breaks that entanglement and
delivers a genuine intention-to-treat estimate of the effect of being behind.

### 3.5 Turn structure **[factor TURN]**

Actions are always simultaneous and sealed: every agent's decision is drawn from the same
pre-action snapshot, and the engine — never generated text — computes all transitions. Speaking
order is **randomised per round and logged**; a simultaneous-speech condition (all speeches drawn
from the same snapshot) is run as a robustness check against framing advantage.

### 3.6 Optional factors **[SCAFFOLD — include only what the budget supports]**

Observability (`O-base / O-transparent / O-monitored with p_fo / O-noisy`), enriched action space
(`WITHDRAW`, graded safety investment, transfers), governance treatments (disclosure, auditor,
liability, enforced if-then commitments, licensing, negotiated treaty), and pool composition
(self-play vs mixed vs scripted ladder).

**Recommendation: pick at most two of these for the first paper.** The factorial is already large.

---

## 4. Validity protocol **[WRITTEN — this is a contribution, not boilerplate]**

We adopt the audit-first stance of Pham et al.: a correctly formatted action is not evidence that
the agent tracked the state that produced it, and in a repeated game one mistracked state
contaminates every later round.

**Level 1 — Mechanical validity.** Property tests over the engine: payoff identities, horizon
distribution, risk formula, tie handling, prize conservation. Plus a **dilemma assertion**: for
every parameter configuration the engine verifies numerically that mutual restraint beats mutual
racing in expectation, and refuses to run otherwise. This prevents the Deadlock failure mode of §3.1.

**Level 2 — Task validity.** A probe battery over rule recall, one-stage payoff lookup, state
reconstruction, state transition, terminal scoring and expected-payoff calculation, with numeric
probes varied by direct wording, paraphrase and calculator disclosure, and categorical probes
additionally order-reversed. **Reference point from the literature:** rule recall 97.4% and payoff
lookup 100% coexisting with state transition 22.2% and expected-payoff calculation 16.7%.

**Level 3 — Representation robustness.** Paraphrase, answer-order reversal, opaque response codes,
narrative skins, and disclosed arithmetic. Reported as deltas, not as pass/fail.

**Level 4 — Continuous audit. [OUR EXTENSION] ⭐** Levels 2–3 are entrance gates: they certify an
agent before play. We additionally interleave lightweight state probes **inside the live race**
("what is your accumulated risk right now?", "how far ahead is the leader?"), score them at round
`t`, and carry the score as a **covariate of the action at round `t`**. This turns comprehension
from a binary filter into a continuous variable and lets us pose a question the entrance gate
cannot:

> Is late-race unsafe play a change of strategy, or a loss of state?

Given the multi-turn degradation literature, our pre-registered directional hypothesis is that a
non-trivial share of what reads as strategic shift in long races is state-tracking drift.

**Decoding contract and provenance.** Every decision records the raw response, parsed action, parser
status, retry count, pre-turn state, prompt hash, configuration hash, seed, temperature and model
identifier. **Temperature is part of the declared contract**; the baseline is `T = 0`.

**Parse failures.** A fallback action changes all later states, so **one parse failure marks the
whole race contaminated**. Critically, a fallback must never be scored as a kept pledge — a naive
"fall back to the agent's own pledge" rule silently inflates integrity. Contaminated races are
excluded from behavioural analysis and their rate is reported alongside every result.

**Evidence strata.** Diagnostic pilots are never pooled with confirmatory inference. A result enters
the confirmatory stratum only when protocol, model identifier, prompt and configuration hashes,
completed-race count and exclusion rules were fixed and recorded before results were inspected.

**Unit of analysis.** The **race**, not the decision. Standard errors cluster at race level.

---

## 5. Measures **[WRITTEN]**

**Aggregate.** Unsafe rate overall and by round. Moloch Index
`(collective optimum − realised welfare) / (collective optimum − non-cooperative floor)`, with the
optimum *computed* (the better of universal restraint and the best feasible win in expectation),
not assumed. Decomposition: breaking round, first defector, recovery after defection.

**Dynamic — the human reference vector. ⭐** We fit the published specification exactly:

```
P(U_i^t) ~ a_{−i}^{t−1} + a_i^{t−1} + ΔS^{t−1} + a_i^1 + a_i^{t−1}×ΔS^{t−1} + treatment + controls
```

from round 2 onward, clustered at race level, and report the coefficient vector against the human
reference `(+0.607, −0.193, −0.296, +0.217)`. Distance in this space is our operational definition
of *dynamic* human-likeness, as opposed to matching a mean. We additionally report **state
sensitivity**: the change in `P(U)` per unit change in each state variable. An extreme policy has
sensitivity near zero by construction.

**Distributional.** Archetype coverage against the human reference distribution
`(39.0 / 49.9 / 5.6 / 5.6)` with an explicit divergence and the entropy of the induced
distribution; within-model spread of player-level unsafe rates; unsupervised clustering over raw
trajectory features rather than hand-designed summaries.

**Communication — new measures. ⭐**

- **Integrity** = kept pledges / issued pledges — **never reported without coverage**.
- **Coverage** = rounds with a pledge / rounds with a meeting.
- **Evasion index** = `P(abstain | about to play U) − P(abstain | about to play S)`.
- **Position-conditioned integrity** = integrity as a function of `ΔS`. *Does honesty depend on
  whether you are winning?* This is the measure that only our design can produce.
- **Deception latency** = round of first pledge violation.
- **Deviation type** following the four-way win-win / selfish / altruistic / sabotaging taxonomy.

**Audit health.** Per-subtask probe accuracy, parse-failure rate, contaminated-race fraction,
representation-robustness deltas. Reported *beside* every behavioural result, not in an appendix.

---

## 6. Hypotheses (pre-registration draft) **[SCAFFOLD — fix before running anything]**

| | Hypothesis | Direction | Basis |
|---|---|---|---|
| **H1** | Randomised starting handicap causes unsafe play | behind ⇒ more unsafe | exogenous version of the human finding |
| **H2** | Collective risk reduces unsafe play relative to private risk | fewer unsafe | shared downside internalises the externality |
| **H2′** | *Or the opposite*: collective risk reduces unsafe play **less** than expected | — | if the downside is shared, unilateral restraint no longer protects you; pre-register both |
| **H3** | Cheap talk (C1–C2) does not reduce unsafe play relative to silence (C0) | null or **increase** | reciprocity-driven contagion; signalling aggression sooner |
| **H4** | Engine-enforced commitment (C6) reduces unsafe play; non-binding pledge (C2) does not | C6 ≪ C2 ≈ C0 | commitment vs cheap talk |
| **H5** | Integrity decreases with falling behind | negative slope on `ΔS` | the paper's core claim, applied to honesty |
| **H6** | Mixed pools break cooperation earlier than self-play | earlier breaking round | CoopEval's co-player variation finding |
| **H7** | Longer horizons increase unsafe play, and the increase is **partly explained by** in-game state-tracking accuracy | mediation | multi-turn degradation |
| **H8** | Abstention rises before defection (evasion index > 0) | positive | new |

**H3 and H8 are the most interesting because they can fail informatively.** A null on H3 is itself
publishable: it would say that the governance instrument most used in practice — public statements
of intent — does nothing in the environment designed to model it.

---

## 7. Experimental design **[SCAFFOLD — fill before the budget request]**

**Phase 1 — Replication.** `N = 2`, C0, private/fraction risk, `p_r^max ∈ {0.1, 0.6, 0.9}`, no
horizon cap, ties split. Refit the human coefficient vector on scripted ladder play and on ≥1 model.
*Gate: no downstream claim is made until the refit reproduces the published coefficients.*

**Phase 2 — Validity gate.** Full probe battery per checkpoint; representation robustness; declare
which checkpoints are admitted.

**Phase 3 — Core factorial (confirmatory).**
`COMM {C0, C2, C6} × RISK-incidence {private, collective} × POS {flat, randomised handicap}`
at `N ∈ {2, 3}`, `p_r^max = 0.6`, `T = 0`, self-play, `M` models.
**[TODO: power analysis. The unit is the race. Estimate races-per-cell from the published
effect sizes — opponent-action β ≈ 0.61, position β ≈ −0.30 — and report the resulting call
count and dollar cost before committing.]**

**Phase 4 — Exploratory pilots.** Long horizons with continuous audit, `N ∈ {4,5}`, mixed pools,
private side-channel, negotiated treaty, `WITHDRAW`. Reported in a separate stratum, never pooled.

**Models. [TODO]** Fix the roster and freeze the endpoints. Include at least one small open-weights
model for the probe battery (cheap, reproducible, and the audit is where volume is needed), and
a mix of frontier families. Record provider route and run period — Pham et al. scope every claim to
these and so should we.

---

## 8. Results **[TODO — placeholder structure]**

- 8.1 Replication check (the coefficient refit table)
- 8.2 Validity gate outcomes per checkpoint
- 8.3 Exogenous position: the causal falling-behind estimate ⭐
- 8.4 Private vs collective risk
- 8.5 The communication ladder, and what abstention reveals ⭐
- 8.6 Position-conditioned integrity ⭐
- 8.7 Distributional diversity vs the human reference
- 8.8 Long horizons: strategy or drift?

---

## 9. Discussion **[SCAFFOLD]**

Organise around three claims, and keep each one inside what the design supports:

1. **What generalises from the human result to LLM agents, and what does not.** Use the coefficient
   vector, not the mean rate.
2. **What communication does.** If H3 holds, the honest framing is uncomfortable and valuable:
   non-binding public commitment is the instrument most available in practice and the one our
   environment says does least. Connect to the governance menu of Bengio et al., and to the
   distinction between a commitment that is text and one that is code.
3. **What we still cannot measure.** Be explicit that an idealised race models a private (or, here,
   shared) speed–safety trade-off and nothing else: not real capabilities, not real regulation, not
   real uncertainty about what a frontier system can do.

---

## 10. Limitations **[WRITTEN — do not soften these]**

1. The race is stylised and short relative to real technological competition.
2. `safe`/`unsafe` are in-game action labels. They are **not** measurements of general model safety,
   risk preference, or deployment suitability.
3. Every behavioural claim is scoped to its tested checkpoint, prompt version, decoding contract,
   configuration and run period.
4. Self-play trajectories are not samples from an evolutionary population; comparisons with the
   evolutionary benchmark are qualitative.
5. Changing `N` also changes the payoff table, opponent count and prompt length, so group-size
   effects are not identified.
6. Randomised handicap identifies the effect of *assigned* position, not of position arrived at
   through play; the two need not coincide.
7. Persona-style prompt manipulations, if included, are prompt conditions and not psychological
   traits. The human elicited-risk null (`r = −0.015`) and the 50–98 pp persona effect are different
   constructs and must not be compared as if they were the same variable.
8. LLM populations are not substitutes for human participants; the human data is a reference for
   observable behaviour, not a target to be matched.

---

## 11. Ethics and broader impact **[SCAFFOLD]**

No human subjects (we reuse the public de-identified dataset under its terms — **[TODO: confirm the
licence and the OSF citation requirement]**). Note the dual-use tension: an environment that
measures when agents deceive is also an environment that demonstrates how. Argue the standard case —
measurement precedes mitigation — and state what we release.

---

## 12. Reproducibility statement **[SCAFFOLD]**

Release: engine, probe battery, prompt templates with hashes, seeds, raw responses, parsed actions,
parser status, full race records, analysis notebooks. Report the contaminated-race rate and the
exclusion rules. Pin model identifiers and run periods.

---

## Open research questions to investigate before writing **[TODO]**

Ordered by how much they would change the paper:

1. **Are the human data actually public and usable?** Pham et al. refit on a "public de-identified
   dataset" from the pre-registration's OSF repository. Get it. Without it there is no human
   reference vector and contribution C1 weakens substantially. *This is a blocking dependency and
   should be resolved first.* Email the authors — Fernández Domingos and Han are on both papers.
2. **Power analysis at the race level.** Everything downstream (budget, model roster, factorial
   size) depends on it. Do it before writing any more of this draft.
3. **Does the collective-risk regime still constitute a social dilemma?** Verify analytically, per
   parameter setting, that mutual restraint beats mutual racing in expectation. This is §4 Level 1,
   and if it fails for the settings we want, the factor has to be re-parameterised.
4. **Equilibrium analysis of the extended game.** The published Nash results (AS never an
   equilibrium; CS unique at `p_r^max = 0.9`) are for the reduced four-strategy two-player game. What
   happens with collective risk, with a pledge stage, with abstention? Even a partial answer makes
   the paper much stronger than a purely empirical one.
5. **Is the four-strategy ladder still the right benchmark** once communication exists? A scripted
   agent needs a pledging policy as well as an action policy, and that is a design choice with no
   published precedent. Define it explicitly (e.g. honest-AS, deceptive-AU, honest-CS) and justify it.
6. **How does the Moloch Index behave** when stage payoffs are reintroduced? The current definition
   is over terminal payoffs only and must be recomputed.
7. **Which deviation taxonomy travels** from the one-shot normal-form setting to a repeated race with
   endogenous state? The four-way classification may need a fifth category for deviations that are
   only profitable given accumulated position.

---

## Appendix A — Parameter reference **[WRITTEN]**

| Symbol | Meaning | Replication value |
|---|---|---|
| `σ(S), σ(U)` | progress per action | 1.0, 1.5 |
| `b, c, s` | round benefit, safety cost, speed factor | 4, 1, 1.5 |
| `B` | terminal prize | 100 |
| `p` | per-round stopping probability after round 5 | 0.20 (`E[T] = 9`) |
| `p_r^max` | maximum private risk | {0.10, 0.60, 0.90} |
| `q_i(T)` | realised risk | `p_r^max · n_i^U(T)/T` |
| `N` | players | 2 (canonical), 3–5 (extension) |
| `π` at N=2 | stage matrix | `[[1.0, 0.6], [2.4, 2.0]]` |

**Human reference coefficients** (Fernández Domingos & Han 2026, replicated by Pham et al. to within
0.002): opponent's previous action `+0.607`; own previous action `−0.193`; progress gap `−0.296`;
first-round action `+0.217`.

**Human archetype distribution:** cautious-starter 39.0%, aggressive-starter/reciprocator 49.9%,
reciprocal catch-up 5.6%, persister 5.6%.

**Reduced strategy set:** AS (always S); AU (always U); CS (S then copy opponent — Tit-for-Tat);
CAS (U then copy opponent — Suspicious Tit-for-Tat). CS and CAS differ **only** in the opening move.

---

## Appendix B — Key references **[WRITTEN]**

**Core three**
- Bengio, Hinton, Yao, Song, et al. *Managing extreme AI risks amid rapid progress.* Science, 2024. arXiv:2310.17688
- Fernández Domingos & Han. *Falling Behind Drives Unsafe Development in an Idealised AI Race Experiment.* arXiv:2607.26034
- Pham, Dao-Sy, Huynh, et al. *Humans Are More Diverse: Frontier LLMs Show Extreme Policies in Idealised AI Development Races.* arXiv:2608.01193

**Formal substrate**
- Han, Pereira, Santos, Lenaerts. *To Regulate or Not: A Social Dynamics Analysis of an Idealised AI Race.* JAIR, 2020
- *Voluntary safety commitments provide an escape from over-regulation in AI development.* arXiv:2104.03741
- *AI development races in heterogeneous settings.* Scientific Reports, 2022

**Cheap talk, deception — closest prior work**
- *Cheap Talk, Empty Promise: Frontier LLMs easily break public promises for self-interest.* arXiv:2604.04782
- *When Agents Lie: Premeditation, Persistence, and Exploitation in Repeated Games.* arXiv:2607.05132
- *Scheming Ability in LLM-to-LLM Strategic Interactions.* arXiv:2510.12826

**Mechanisms**
- *CoopEval: Benchmarking Cooperation-Sustaining Mechanisms and LLM Agents in Social Dilemmas.* ICML 2026. arXiv:2604.15267
- *Cooperation, Competition, and Maliciousness: LLM-Stakeholders Interactive Negotiation.* arXiv:2309.17234

**Multi-turn degradation**
- *When Attention Closes: How LLMs Lose the Thread in Multi-Turn Interaction.* arXiv:2605.12922
- *Drift No More? Context Equilibria in Multi-Turn LLM Interactions.* arXiv:2510.07777
- *Lost in the Middle.* arXiv:2307.03172

**Evaluation and framing sensitivity**
- *Understanding LLM Agent Behaviours via Game Theory.* arXiv:2512.07462
- *How Far Are We on the Decision-Making of LLMs?* (GAMA-Bench) arXiv:2403.11807
- FAIRGAME. arXiv:2504.14325
