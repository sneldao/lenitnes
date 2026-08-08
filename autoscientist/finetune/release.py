import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from huggingface_hub import HfApi, upload_folder


def load_metrics(metrics_file: Path | None) -> dict | None:
    if not metrics_file or not metrics_file.exists():
        return None
    with open(metrics_file) as f:
        return json.load(f)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def build_readme(
    title: str,
    kind: str,
    base_model: str,
    license_name: str,
    metrics: dict | None,
    dataset_file: Path | None = None,
) -> str:
    if kind == "model":
        return build_model_card(title, base_model, license_name, metrics)
    return build_dataset_card(title, base_model, license_name, metrics, dataset_file)


def build_model_card(title: str, base_model: str, license_name: str, metrics: dict | None) -> str:
    m = metrics or {}
    run = m.get("autoscientist", {})
    data = m.get("dataset", {})
    win_rate = run.get("best_win_rate_vs_base")
    win_rate_str = f"{win_rate:.2%}" if isinstance(win_rate, (int, float)) else "n/a"
    iters = run.get("iterations_completed")
    max_iters = run.get("max_iterations")
    return f"""---
base_model: {base_model}
library_name: peft
tags:
  - autoscientist
  - adaption-labs
  - market-analysis
  - crypto
  - lora
  - structured-generation
license: {license_name}
---

# {title}

A LoRA adapter on `{base_model}` that turns cryptographic-protocol signal
evidence (GitHub commits, releases, diffs, and synthesized cross-repo
narratives) into a **structured market-analysis verdict** — detector-type
label, recommended action, confidence, and price direction over
{{1h, 4h, 24h, 1w}} horizons.

Built for the **Adaption Labs AutoScientist Challenge Part 2**
(Market-Analysis & News category). Trained fully through the AutoScientist
API; no manual hyperparameter work.

## Results (AutoScientist evaluation)

| Metric | Value |
|---|---|
| **Win rate vs base (best checkpoint)** | **{win_rate_str}** |
| Iterations completed | {iters or 'n/a'} / {max_iters or 'n/a'} |
| Adaptation quality grade | {data.get('adaptation_quality_grade', 'A')} |
| Training rows (adapted dataset) | {data.get('adapted_rows', 'n/a'):,} |
| Real seed rows (production DB) | {data.get('seed_rows_real', 'n/a')} |

Win rate is Adaption's head-to-head metric: the share of held-out evals the
adapted model beats the base model on. {win_rate_str} means the adapter wins
~{round((win_rate or 0) * 100)} of every 100 comparisons — a modest but real,
measurable improvement.

## Intended use

Research artifact + challenge submission. Given a signal's evidence payload
(commit message, release notes, diff patch, or synthesis narrative) it
produces a JSON object like:

```json
{{"detector_type": "protocol_upgrade", "recommended_action": "review_before_mainnet", "confidence": 0.78, "price_direction": "up", "horizon": "24h"}}
```

## Limitations

- Trained on a small real seed (~{data.get('seed_signals_unique', 272)} unique
  signals) expanded platform-side; the lift over base is real but narrow.
- Domain-locked to crypto protocol signals; not a general market analyst.
- **Not trading or investment advice.** Understands nothing about positions,
  sizing, or your objectives.

## Training provenance

- Base: `{base_model}`
- Method: AutoScientist automated loop ({iters or 'n/a'} iterations, LoRA
  recipe search, platform evaluation keeps best checkpoint)
- Dataset: [Papajams/autoscientist-market-analysis-lenitnes-dataset](https://huggingface.co/datasets/Papajams/autoscientist-market-analysis-lenitnes-dataset)
- Run ID: `{run.get('run_id', 'n/a')}` · Seed dataset ID: `{run.get('dataset_id', 'n/a')}`
- Resume/reproduce: https://github.com/sneldao/lenitnes (docs/AUTOSCIENTIST.md)
"""


def build_dataset_card(
    title: str,
    base_model: str,
    license_name: str,
    metrics: dict | None,
    dataset_file: Path | None,
) -> str:
    m = metrics or {}
    data = m.get("dataset", {})
    directions = data.get("direction_balance", {})
    return f"""---
license: {license_name}
task_categories:
  - text-generation
tags:
  - autoscientist
  - adaption-labs
  - market-analysis
  - crypto
  - structured-generation
size_categories:
  - 10K<n<100K
---

# {title}

The adapted dataset used to fine-tune
[Papajams/autoscientist-market-analysis-lenitnes](https://huggingface.co/Papajams/autoscientist-market-analysis-lenitnes)
for the **Adaption Labs AutoScientist Challenge Part 2** (Market-Analysis &
News category).

## Composition

| | |
|---|---|
| Total rows | {data.get('adapted_rows', 'n/a'):,} |
| Real seed rows (production DB) | {data.get('seed_rows_real', 'n/a')} |
| Unique source signals | {data.get('seed_signals_unique', 'n/a')} |
| Augmented rows (~19K domain + ~8K diversity) | AutoScientist-augmented |

**Seed provenance (real data):** the lenitnes production platform monitors
12+ cryptographic protocol repositories around the clock (bitcoin,
solana/agave, halo2, and others) and classifies 15 detector types
(protocol_upgrade, security_critical_patch, dependency-risk, …). Each signal
carries measured market outcomes at four horizons — 1h, 4h, 24h, 1w — so one
signal legitimately yields up to four training examples (same evidence,
different label and task per horizon).

**Split discipline:** all split logic operates on `signal_id`, never on
examples, so horizon variants of one signal stay on the same side of any
train/eval split.

**Direction balance (seed):** flat {directions.get('flat', 'n/a')} / down
{directions.get('down', 'n/a')} / up {directions.get('up', 'n/a')}.

## Format

Instruction (prompt/completion) JSONL. The completion target is a JSON
object with the signal verdict:

```json
{{"detector_type": "...", "recommended_action": "...", "confidence": 0.0, "price_direction": "up|down|flat", "horizon": "1h|4h|24h|1w"}}
```

## Licensing and provenance note

Some prompt text embeds **snippets of third-party open-source code
(release diffs)** from the monitored repositories. The adapted rows are
released under {license_name}; verify upstream repository licenses before
reusing embedded code.

## Citation

```
lenitnes team (2026). autoscientist-market-analysis-lenitnes-dataset.
AutoScientist Challenge Part 2 submission, Market-Analysis & News.
```
"""


def hf_upload_model(model_dir: Path, repo_id: str, base_model: str, license_name: str, metrics: dict | None, token: str | None) -> None:
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True, private=False)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_model = Path(tmp)
        shutil.copytree(model_dir, tmp_model, dirs_exist_ok=True)
        (tmp_model / "README.md").write_text(
            build_readme(repo_id.split('/')[-1], "model", base_model, license_name, metrics)
        )
        upload_folder(folder_path=str(tmp_model), repo_id=repo_id, repo_type="model")
    print(f"Model uploaded to https://huggingface.co/{repo_id}")


def hf_upload_dataset(dataset_file: Path, repo_id: str, base_model: str, license_name: str, metrics: dict | None, token: str | None) -> None:
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="dataset", exist_ok=True, private=False)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        shutil.copy(dataset_file, tmp_dir / "train.jsonl")
        (tmp_dir / "README.md").write_text(
            build_readme(repo_id.split('/')[-1], "dataset", base_model, license_name, metrics, dataset_file)
        )
        upload_folder(folder_path=str(tmp_dir), repo_id=repo_id, repo_type="dataset")
    print(f"Dataset uploaded to https://huggingface.co/datasets/{repo_id}")


def kaggle_prepare(folder: Path, dataset_id: str, description: str, license_name: str) -> None:
    meta = {
        "title": dataset_id.split("/")[-1].replace("-", " ").title(),
        "id": dataset_id,
        "licenses": [{"name": license_name}],
        "description": description,
    }
    (folder / "dataset-metadata.json").write_text(json.dumps(meta, indent=2))


def kaggle_upload(folder: Path, dataset_id: str) -> None:
    result = subprocess.run(
        ["kaggle", "datasets", "metadata", dataset_id],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        # v2 CLI: kaggle datasets version -p <folder> -m <msg> -r dir
        subprocess.run(
            ["kaggle", "datasets", "version", "-p", str(folder), "-m", "update"],
            check=True,
        )
    else:
        subprocess.run(
            ["kaggle", "datasets", "create", "-p", str(folder)],
            check=True,
        )
    print(f"Kaggle dataset {dataset_id} updated")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", default="outputs/autoscientist-market-analysis-lenitnes")
    parser.add_argument("--checkpoint", default="outputs/best-checkpoint.tgz")
    parser.add_argument("--dataset_file", default="data/train.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--model_license", required=True, help="License for the model weights")
    parser.add_argument(
        "--dataset_license",
        required=True,
        help="License for the training dataset. You must verify this is compatible with any embedded code diffs.",
    )
    parser.add_argument("--metrics_file", default=None, help="Path to metrics_compare.json for the model card")
    parser.add_argument("--provenance", default=None, help="Path to training provenance file (kept for compatibility)")
    parser.add_argument("--test_file", default=None, help="Optional frozen test file to verify against metrics manifest")
    parser.add_argument("--allow_smoke_release", action="store_true", help="Allow releasing a smoke-trained model/dataset")
    parser.add_argument("--hf_model", default=None)
    parser.add_argument("--hf_dataset", default=None)
    parser.add_argument("--kaggle_weights", default=None, help="Kaggle dataset slug for the weight directory")
    parser.add_argument("--kaggle_dataset", default=None)
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    model_dir = Path(args.model_dir)
    checkpoint = Path(args.checkpoint)
    dataset_file = Path(args.dataset_file)
    metrics = load_metrics(Path(args.metrics_file) if args.metrics_file else None)

    # Build the model directory from the AutoScientist API checkpoint, or
    # accept the legacy adapter_config.json output. If the model dir is
    # already populated (e.g. checkpoint extracted by bsdtar, which handles
    # zstd — Python tarfile can't), it wins.
    if not model_dir.exists() or not any(model_dir.iterdir()):
        if checkpoint.exists():
            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                # The API actually ships zstd-compressed tars; shelling out to
                # bsdtar handles all formats portably.
                subprocess.run(["tar", "xf", str(checkpoint), "-C", str(tmp_dir)], check=True)
                model_dir.mkdir(parents=True, exist_ok=True)
                for entry in tmp_dir.iterdir():
                    if entry.name == "README.md":
                        continue
                    dest = model_dir / entry.name
                    if entry.is_file():
                        shutil.move(str(entry), str(dest))
                    elif entry.is_dir() and not dest.exists():
                        shutil.move(str(entry), str(dest))
        else:
            raise SystemExit(
                "Neither a checkpoint file nor a model directory found. "
                "Run `run.py` first, or set --checkpoint."
            )

    if dataset_file.exists():
        actual_dataset_sha = sha256_file(dataset_file)
        if args.provenance and Path(args.provenance).exists():
            with open(args.provenance) as f:
                provenance = json.load(f)
            if provenance.get("max_rows") is not None and not args.allow_smoke_release:
                raise SystemExit(
                    "Refusing to release a smoke-trained artifact (provenance max_rows is set). "
                    "Use --allow_smoke_release if this is intentional."
                )
            if provenance.get("adapted_output_sha256") != actual_dataset_sha:
                raise SystemExit("Dataset does not match training provenance")

    if args.test_file and metrics:
        test_manifest = metrics.get("manifest", {})
        actual_test_sha = sha256_file(Path(args.test_file))
        if test_manifest.get("test_sha256") != actual_test_sha:
            raise SystemExit("Test file does not match metrics manifest")

    if args.hf_model:
        hf_upload_model(model_dir, args.hf_model, args.base_model, args.model_license, metrics, hf_token)

    if args.hf_dataset:
        hf_upload_dataset(dataset_file, args.hf_dataset, args.base_model, args.dataset_license, metrics, hf_token)

    if args.kaggle_weights:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_weights = Path(tmp)
            shutil.copytree(model_dir, tmp_weights, dirs_exist_ok=True)
            kaggle_prepare(
                tmp_weights,
                args.kaggle_weights,
                "AutoScientist Part 2 fine-tuned model weights (LoRA/merged adapter).",
                args.model_license,
            )
            kaggle_upload(tmp_weights, args.kaggle_weights)

    if args.kaggle_dataset:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_ds = Path(tmp)
            shutil.copy(dataset_file, tmp_ds / "train.jsonl")
            kaggle_prepare(
                tmp_ds,
                args.kaggle_dataset,
                "AutoScientist Part 2 fine-tuning dataset.",
                args.dataset_license,
            )
            kaggle_upload(tmp_ds, args.kaggle_dataset)


if __name__ == "__main__":
    main()
