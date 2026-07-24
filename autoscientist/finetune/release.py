import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from huggingface_hub import HfApi, upload_folder


def hf_upload_model(model_dir: Path, repo_id: str, token: str | None) -> None:
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True, private=False)
    upload_folder(folder_path=str(model_dir), repo_id=repo_id, repo_type="model")
    print(f"Model uploaded to https://huggingface.co/{repo_id}")


def hf_upload_dataset(dataset_file: Path, repo_id: str, token: str | None) -> None:
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="dataset", exist_ok=True, private=False)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        shutil.copy(dataset_file, tmp_dir / "train.jsonl")
        (tmp_dir / "README.md").write_text(
            f"# {repo_id.split('/')[-1]}\n\n"
            "AutoScientist Part 2 Math & Code fine-tuning dataset.\n"
            "Each row is a chat-formatted example mapping GitHub commit evidence "
            "to signal classifications and 24h price direction labels.\n"
        )
        upload_folder(folder_path=str(tmp_dir), repo_id=repo_id, repo_type="dataset")
    print(f"Dataset uploaded to https://huggingface.co/datasets/{repo_id}")


def kaggle_prepare(folder: Path, dataset_id: str, description: str) -> None:
    meta = {
        "title": dataset_id.split("/")[-1].replace("-", " ").title(),
        "id": dataset_id,
        "licenses": [{"name": "CC0-1.0"}],
        "description": description,
    }
    (folder / "dataset-metadata.json").write_text(json.dumps(meta, indent=2))


def kaggle_upload(folder: Path, dataset_id: str) -> None:
    cmd_base = ["kaggle", "datasets", "-p", str(folder)]
    result = subprocess.run(
        ["kaggle", "datasets", "metadata", dataset_id],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        action = ["version", "-m", "update"]
    else:
        action = ["create"]
    subprocess.run(cmd_base + action, check=True)
    print(f"Kaggle dataset {dataset_id} updated")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", default="outputs/autoscientist-math-code-lenitnes")
    parser.add_argument("--dataset_file", default="data/train.jsonl")
    parser.add_argument("--hf_model", default=None)
    parser.add_argument("--hf_dataset", default=None)
    parser.add_argument("--kaggle_model", default=None)
    parser.add_argument("--kaggle_dataset", default=None)
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    model_dir = Path(args.model_dir)
    dataset_file = Path(args.dataset_file)

    if not model_dir.exists():
        raise SystemExit(f"Model directory not found: {model_dir}")
    if not dataset_file.exists():
        raise SystemExit(f"Dataset file not found: {dataset_file}")

    if args.hf_model:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_model = Path(tmp)
            shutil.copytree(model_dir, tmp_model, dirs_exist_ok=True)
            (tmp_model / "README.md").write_text(
                f"# {args.hf_model.split('/')[-1]}\n\n"
                "Fine-tuned Qwen2.5-Coder-0.5B LoRA adapter for the AutoScientist "
                "Part 2 Math & Code category. Maps GitHub commit/diff evidence to "
                "crypto signal classifications and 24h price direction.\n"
            )
            hf_upload_model(tmp_model, args.hf_model, hf_token)

    if args.hf_dataset:
        hf_upload_dataset(dataset_file, args.hf_dataset, hf_token)

    if args.kaggle_model:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_model = Path(tmp)
            shutil.copytree(model_dir, tmp_model, dirs_exist_ok=True)
            kaggle_prepare(
                tmp_model,
                args.kaggle_model,
                "AutoScientist Part 2 Math & Code fine-tuned model weights.",
            )
            kaggle_upload(tmp_model, args.kaggle_model)

    if args.kaggle_dataset:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_ds = Path(tmp)
            shutil.copy(dataset_file, tmp_ds / "train.jsonl")
            kaggle_prepare(
                tmp_ds,
                args.kaggle_dataset,
                "AutoScientist Part 2 Math & Code fine-tuning dataset.",
            )
            kaggle_upload(tmp_ds, args.kaggle_dataset)


if __name__ == "__main__":
    main()
