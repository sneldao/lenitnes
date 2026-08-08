# AutoScientist Challenge — Market Analysis & News (Part 2)

Submission plan and operational runbook for the Adaption AutoScientist
Challenge, Part 2 (Jul 6 – Aug 10, 2026, winners Aug 17). Category:
**Market-Analysis & News**.

## Goal

Train a model that turns GitHub commit / release signal evidence into
structured market-analysis output — detector labels, recommended action,
confidence, and 24h price direction — and beats the base model on
Adaption's held-out test set. Deliverables per the challenge rules:

1. Adapted dataset released to Hugging Face **and** Kaggle.
2. Trained weights released to Hugging Face **and** Kaggle.
3. Measurable relative improvement vs the baseline model.
4. Bonus: public demo + social posts tagging Adaption.

## Why the Adaption-native pipeline (no local training)

The first attempt (`adapt.py` + `train.py`, deleted) fine-tuned a
Qwen2.5-Coder-0.5B LoRA locally after an Adaptive Data run. Adaption's
AutoScientist API (SDK ≥ 0.6.0; we run 0.7.0) replaces that loop
entirely — their platform co-optimizes data and training recipe,
evaluates head-to-head against the base model, and returns the best
checkpoint. Advantages: no GPU needed, recipe search included, and the
platform's `best_win_rate` metric _is_ the "relative improvement" number
the challenge scores.

Their docs are unambiguous that small local models and thin data are the
top failure mode: "Flat or negative quality/win rate after training —
use at least a **7–8B model**, increase epochs, and consider the
**20,000-datapoint threshold**." We follow that.

## Data audit (production VPS, 2026-08-07)

Source: the lenitnes production database on the vultr VPS, inside the
`lenitnes-db-1` Docker container (`/opt/lenitnes`, deployed via
`infra/deploy.sh` + `docker compose`). **The host's `localhost:5432` is
empty** — the real database lives inside the Docker network. Always
query via `sudo docker exec -i lenitnes-db-1 psql -U lenitnes -d lenitnes`.

| Table                                                           | Rows                       | Notes                                         |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------- |
| signals (total)                                                 | 14,393                     | 96% are heartbeats (watchdog rows)            |
| non-heartbeat with evidence                                     | 539                        | real signal events                            |
| on GitHub monitors                                              | 157                        | 12 monitored repos (bitcoin, halo2, agave, …) |
| fully exportable (evidence + classification + 24h outcome)      | **154**                    | base seed                                     |
| synthesized monitors (narrative/proactive/thesis) with outcomes | ~112                       | multi-repo cross-signal, on-category          |
| 24h direction balance                                           | 120 down / 89 up / 57 flat | workable; not majority-dominated              |
| detector types                                                  | 15 (427 classifications)   | protocol_upgrade, security_critical_patch, …  |

The 70-row dataset already on Adaption
(`crypto_commit_signal_analysis`, A-grade) is a Jul 24 snapshot of the
same source — our export supersedes it (2× rows, current through Aug 7).

## Seed expansion strategy (real rows, not hallucinated labels)

Adaption recommends ~20K rows total. One month of collection on 15
monitors yields ~266 signal events, so real data alone can't reach that.
Instead of inflating volume with invented labels, we expand the _real_
seed legitimately:

1. **All monitors, not just github** — include the three synthesized
   monitors (narrative:portfolio, proactive:signals, synthesis:thesis).
   Their evidence text is multi-repo commit synthesis; the category
   explicitly covers news/market synthesis. (+~112 rows)
2. **Multi-window labels** — outcome rows exist for 1h/4h/24h/1w
   (272/272/266/192). The same evidence with a "predict 1h direction"
   vs "predict 24h direction" prompt is a genuinely different task with
   genuinely different labels, so one signal legitimately yields up to
   ~3 training rows. (~154 signals → ~500–700 rows)
3. Split by **signal_id**, never by example — variants of one signal
   must stay on the same side of any train/eval split.

Target real seed: **~500–700 rows**. Augmentation (domain expansion to
the 20K threshold + ~8K diversity rows) makes up the rest per Adaption's
guidance; their evaluation keeps the best checkpoint, and their
common-issues doc explicitly ties the 20K threshold to non-flat win
rates. Credits are not a constraint.

### Actual export (2026-08-07)

`export_dataset.py` produced **1,002 examples from 272 unique signals**
in `data/all.jsonl` (250-row probe + full run):

| Dimension                | Value                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| windows                  | 1h: 272, 4h: 272, 24h: 266, 1w: 192                              |
| monitor kind             | github: 589 (577 with embedded diff patches), synthesis: 413     |
| completion JSON validity | 1002/1002 parse                                                  |
| direction balance        | flat 366 / down 331 / up 305 (windows de-skew the 24h-only view) |
| prompt size              | avg 2.1 KB, max 6.2 KB                                           |

Window expansion _reduced_ class imbalance vs the 24h-only slice
(120/89/57) because shorter horizons label as `flat` more often and the
1w window picks up trends the 24h window misses.

## Training configuration (AutoScientist API)

| Parameter                 | Value                              | Rationale                                                                                                             |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| model                     | `Qwen/Qwen3.5-9B` (LoRA, 262K ctx) | ≥7–8B per common-issues guidance; strong recent instruct model; cheap enough for same-day iteration vs 27–70B options |
| training_type             | `lora`                             | cheap, release-able adapter                                                                                           |
| max_iterations            | 5                                  | recipe search depth vs 3-day timeline                                                                                 |
| target_win_rate           | 0.70                               | win rate = head-to-head vs base on our data; 0.66 was previously achieved on this account with 12K rows               |
| augmentation_domain_rows  | fill to ~20K total                 | their guidance; credits are not a constraint                                                                          |
| augmentation_general_rows | 8,000                              | diversity retention                                                                                                   |

## Pipeline

`autoscientist/finetune/`:

- `export_dataset.py` — queries the VPS DB (docker exec) → prompt/completion
  JSONL. Now includes synthesized monitors and one row per
  `(signal, window)` pair. Uses the live agent's classification JSON as
  the completion label.
- `run.py` — upload → Adaptive Data adapt → `autoscientist.create` →
  wait → stream `best-checkpoint.tgz`. `--estimate` first prints credit
  cost without charging.
- `release.py` — extracts `best-checkpoint.tgz` → uploads weights +
  dataset to Hugging Face and Kaggle.
- `requirements.txt` — adaption 0.7.0, torch 2.2.2 (numpy<2 pin matters:
  numpy 2.x breaks the torch build in this tree). Venv lives at
  `autoscientist/.venv` (homebrew python3.11).

## Timeline (deadline Aug 10 EAT)

- **Aug 7** — export enriched seed, upload, adapt, launch AutoScientist
  (train loop: ~≤4h). Estimate credits first (`run.py --estimate`). ✅
- **Aug 8** — download checkpoint, HF + Kaggle release. ✅ (Kaggle CLI v2
  was already configured as `kaggle auth ACCESS_TOKEN` for
  user `udingethe`; no `kaggle.json` needed.)
- **Aug 9** — submission form (category: Market-Analysis & News), demo,
  social posts tagging @adaption_ai / adaption-labs. ⏳ (see checklist below)
- **Aug 10** — buffer + final checks.

## Run results (2026-08-08)

|                       | value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Adaption dataset      | `c701c50c-7582-4be1-9d7c-62618a001738` (1,002 rows, adaptation grade A, score 9.0) |
| AutoScientist run     | `4b0ef68e-a233-454b-87d5-203f5c9d401c` (succeeded, 5/5 iterations)                 |
| best_win_rate vs base | **0.5256** (adapted model beats base on ~52.6% of head-to-head evals)              |
| adapted dataset size  | 27,965 rows (1,002 real + ~27K augmented)                                          |
| model                 | Qwen/Qwen3.5-9B, LoRA adapter (15.7MB)                                             |

## Release URLs (all public)

| Artifact                 | URL                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Weights (HF)             | https://huggingface.co/Papajams/autoscientist-market-analysis-lenitnes                   |
| Adapted dataset (HF)     | https://huggingface.co/datasets/Papajams/autoscientist-market-analysis-lenitnes-dataset  |
| Weights (Kaggle)         | https://www.kaggle.com/datasets/udingethe/autoscientist-market-analysis-lenitnes         |
| Adapted dataset (Kaggle) | https://www.kaggle.com/datasets/udingethe/autoscientist-market-analysis-lenitnes-dataset |

## Submission checklist (owner: you)

1. Contest form: https://forms.gle/jx6VxMRhESHEgyoHA — include the 4 URLs
   above plus the Adaption dataset/run IDs as reproducibility proof.
2. Social bonus: post a build thread in Discord #social + X/LinkedIn tagging
   the challenge handles, recounting the 5-iteration win-rate curve → 0.5256.

## Gotchas hit during setup

- `adaption` must be `>=0.7.0` (AutoScientist API only exists there).
- SDK `autoscientist.create()` in 0.7.0 does **not** accept `training_type`
  (docs stale) — training type chosen via hyperparams/platform default.
- Checkpoints are **zstd**-tars; Python `tarfile` can't open them — shell
  out to bsdtar (`tar xf path -C dir`, it auto-detects).
- Kaggle CLI v2 order: `datasets create -p <dir>`, and
  `datasets metadata <slug> --update -p <dir>` (v1's `-p <dir> create` is
  rejected). Datasets are created **private**; flip `info.isPrivate` to
  false in `dataset-metadata.json` and re-upload with `--update`.

## Risks and mitigations

- **Flat win rate** — the #1 submission-killer. Mitigate via 7–8B+
  model, 20K augmentation threshold, 5 iterations, target 0.70.
- **Multi-window leakage** — variants of one signal split by signal_id
  only. Enforced in export.
- **Credit burn on misconfigured runs** — always `--estimate` first;
  burn-so-far note: one failed 1.0-credit run on the stale Jul 24
  dataset (wrong column mapping) during the overhaul.
