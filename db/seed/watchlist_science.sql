-- ─────────────────────────────────────────────────────────────
-- Seed: LENITNES[science] watchlist (re:AGENT pivot, Aug 2026).
-- Scientific-software repos whose commit streams carry early
-- signals about the reliability of the published record.
--
-- Default branches verified against the GitHub API on 2026-08-15:
--   afni/afni=master  nextstrain/ncov=master  nextstrain/mpox=master
--   Opentrons/opentrons=edge  choderalab/openmmtools=main
--   jwohlwend/boltz=main (Boltz sponsor anchor, verified 2026-08-16)
--   ArcInstitute/cell-eval=main (Arc co-host, verified 2026-08-16)
--   Biohub/esm=main (CZ Biohub co-host, verified 2026-08-16)
--
-- See docs/RAGENT_PIVOT.md → "Verified anchors" and "Signal classes".
-- asset_mapping is '{}' on purpose: science outcomes are discrete dated
-- events (retraction / correction / disclosure / release), not price
-- moves. The event columns live on signal_outcomes (migration 008).
-- ─────────────────────────────────────────────────────────────

-- Unique index also created by watchlist.sql; guarded for standalone runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_url ON monitors (url);

INSERT INTO monitors (url, condition_text, frequency_seconds, screenshots_enabled, is_public, confidence_threshold, asset_mapping, domain)
VALUES
  -- Validity-threat watch: statistical-method fixes in a widely-used
  -- neuroimaging tool. The 2015 3dClustSim edge-effect fix (2baf5710)
  -- preceded the Eklund et al. "Cluster failure" exposure (PNAS 2016)
  -- and the downstream retractions — the founding LENITNES[science] case.
  (
    'https://github.com/afni/afni/commits/master',
    'Any commit fixing, correcting, or silently changing statistical methods, analysis pipelines, cluster inference, or results-affecting code in widely-used scientific software.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- Outbreak early-warning: pathogen genomic surveillance pipelines.
  -- Activity spikes and new-clade handling precede public variant
  -- risk assessments.
  (
    'https://github.com/nextstrain/ncov/commits/master',
    'Any commit indicating new lineage/clade tracking, surveillance pipeline changes, or anomalous activity spikes in pathogen genomic data.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  (
    'https://github.com/nextstrain/mpox/commits/master',
    'Any commit indicating new clade tracking, surveillance pipeline changes, or anomalous activity spikes.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- Research-direction leaks: lab-automation protocol changes precede
  -- experimental shifts and preprints.
  (
    'https://github.com/Opentrons/opentrons/commits/edge',
    'Any commit indicating protocol-design changes, new assay/automation capabilities, or breaking changes to experimental workflows.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- Drug-discovery simulation tooling: method additions/fixes signal
  -- which targets and free-energy approaches a lab is pursuing.
  (
    'https://github.com/choderalab/openmmtools/commits/main',
    'Any commit indicating new sampling/free-energy methods, fixes to statistical estimators, or changes to simulation protocol correctness.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- Boltz (hackathon sponsor): biomolecular interaction prediction.
  -- Precision/inference fixes in a structure-prediction model change
  -- what downstream results mean — the sentinel's core thesis.
  (
    'https://github.com/jwohlwend/boltz/commits/main',
    'Any commit indicating fixes to model inference precision, training or sampling correctness, or changes affecting reproducibility of predicted structures.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- Arc Institute (hackathon co-host): evaluation suite for perturbation-
  -- prediction models. Changes to scoring/evaluation logic in a model-
  -- validation tool alter what downstream results are deemed reliable.
  (
    'https://github.com/ArcInstitute/cell-eval/commits/main',
    'Any commit indicating fixes to evaluation metrics, scoring or benchmarking logic, ground-truth handling, or changes affecting the validity of perturbation-prediction results.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  ),
  -- CZ Biohub (hackathon co-host): protein language-model / structure
  -- research codebase. Fixes to model weights, tokenization, or indexing
  -- in structure notebooks change the reproducibility of predictions.
  (
    'https://github.com/Biohub/esm/commits/main',
    'Any commit indicating fixes to model weights, tokenization, structure prediction, or indexing bugs that affect reproducibility of scientific results.',
    3600, false, true, 15,
    '{}'::jsonb, 'science'
  )
ON CONFLICT DO NOTHING;
