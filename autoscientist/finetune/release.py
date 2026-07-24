import argparse
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


def build_readme(
    title: str,
    kind: str,
    base_model: str,
    license_name: str,
    metrics: dict | None,
    dataset_file: Path | None = None,
) -> str:
    lines = [f"# {title}", ""]
    if kind == "model":
        lines.append(
            f"Fine-tuned adapter on `{base_model}` for the AutoScientist Part 2 "
            "submission. Maps GitHub commit/diff evidence to crypto signal "
            "classifications and 24h price direction labels."
        )
    else:
        lines.append(
            "AutoScientist Part 2 fine-tuning dataset. Each row is a chat-formatted "
            "example mapping GitHub commit evidence to signal classifications and "
            "24h price direction labels."
        )
    lines.append("")
    lines.append(f"## License")
    lines.append(f"{license_name}")
    if kind == "dataset":
        lines.append(
            "This dataset may contain snippets of third-party source code. "
            "Verify the upstream repository licenses and provenance before reuse."
        )
    lines.append("")
    lines.append(f"## Base model")
    lines.append(f"{base_model}")
    lines.append("")
    if dataset_file:
        lines.append("## Source dataset")
        lines.append(f"{dataset_file.name}")
        lines.append("")
    if metrics:
        lines.append("## Benchmarks")
        lines.append("```json")
        lines.append(json.dumps(metrics, indent=2))
        lines.append("```")
        lines.append("")
    lines.append("## Limitations")
    lines.append(
        "This is a research artifact. The model was trained on a small, domain-specific "
        "dataset and should not be relied upon for real trading or investment decisions."
    )
    return "\n".join(lines)


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
        action = ["version", "-m", "update"]
    else:
        action = ["create"]
    subprocess.run(["kaggle", "datasets", "-p", str(folder)] + action, check=True)
    print(f"Kaggle dataset {dataset_id} updated")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", default="outputs/autoscientist-market-analysis-lenitnes")
    parser.add_argument("--dataset_file", default="data/train.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--model_license", required=True, help="License for the model weights")
    parser.add_argument(
        "--dataset_license",
        required=True,
        help="License for the training dataset. You must verify this is compatible with any embedded code diffs.",
    )
    parser.add_argument("--metrics_file", default=None, help="Path to metrics_compare.json for the model card")
    parser.add_argument("--hf_model", default=None)
    parser.add_argument("--hf_dataset", default=None)
    parser.add_argument("--kaggle_weights", default=None, help="Kaggle dataset slug for the weight directory")
    parser.add_argument("--kaggle_dataset", default=None)
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    model_dir = Path(args.model_dir)
    dataset_file = Path(args.dataset_file)
    metrics = load_metrics(Path(args.metrics_file) if args.metrics_file else None)

    if not model_dir.exists():
        raise SystemExit(f"Model directory not found: {model_dir}")
    if not dataset_file.exists():
        raise SystemExit(f"Dataset file not found: {dataset_file}")

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
