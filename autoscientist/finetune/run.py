#!/usr/bin/env python3
"""Run the AutoScientist API training loop: upload, adapt, train, download.

This replaces the old adaptive-data + manual fine-tuning path. The flow is:

  1. Upload the training dataset to Adaption.
  2. Run Adaptive Data dataset adaptation.
  3. Launch the AutoScientist automated training loop, which co-optimizes data
     and the training recipe until quality converges on the target win rate.
  4. Download the best checkpoint (LoRA weights + tokenizer).

Usage (after exporting + splitting the data):

    python run.py --input data/train.jsonl

Run with --estimate first to see the cost before committing credits.
"""

import argparse
import os
import time
from pathlib import Path

from adaption import Adaption


def count_jsonl_lines(path: Path) -> int:
    count = 0
    with open(path) as f:
        for _ in f:
            count += 1
    return count


def run_pipeline(
    *,
    input_path: Path,
    output_dir: Path,
    name: str,
    max_iterations: int,
    target_win_rate: float,
    estimate: bool,
    model: str | None,
    max_rows: int | None,
    wait_timeout: int = 1800,
    train_timeout: int = 14400,
    domain_rows: int | None = None,
    general_rows: int | None = None,
    mean_domain_target: int = 20_000,
    poll_every: int = 60,
) -> None:
    api_key = os.environ.get("ADAPTION_API_KEY")
    if not api_key:
        raise SystemExit("ADAPTION_API_KEY is required")

    client = Adaption(api_key=api_key)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    source_rows = count_jsonl_lines(input_path)
    print(f"Input dataset: {input_path} ({source_rows} rows)")

    # Step 1: Upload
    upload_kwargs: dict = {}
    if name:
        upload_kwargs["name"] = name

    print("Uploading dataset...")
    upload = client.datasets.upload_file(str(input_path), **upload_kwargs)
    dataset_id = upload.dataset_id
    print(f"Uploaded to dataset {dataset_id}")

    # Wait for ingestion to finish.
    print("Waiting for dataset ingestion to complete...")
    deadline = time.time() + wait_timeout
    while time.time() < deadline:
        status = client.datasets.get_status(dataset_id)
        if status.row_count is not None and status.row_count > 0:
            print(f"Ingestion complete: {status.row_count} rows processed.")
            break
        time.sleep(3)
    else:
        raise SystemExit(f"Dataset ingestion timed out after {wait_timeout}s")

    if estimate:
        print("Estimating adaptation + training cost...")
        run_kwargs: dict = {"column_mapping": {"prompt": "prompt", "completion": "completion"}}
        if max_rows:
            run_kwargs["job_specification"] = {"max_rows": max_rows}
        estimate_result = client.datasets.run(dataset_id, **run_kwargs, estimate=True)
        print(f"Estimated credits: {estimate_result.estimated_credits_consumed}")
        print("Run complete. To start the real run, rerun without --estimate.")
        return

    # Step 2: Adaptive Data adaptation.
    print("Starting Adaptive Data adaptation...")
    run_kwargs: dict = {"column_mapping": {"prompt": "prompt", "completion": "completion"}}
    if max_rows:
        run_kwargs["job_specification"] = {"max_rows": max_rows}
    adapt_run = client.datasets.run(dataset_id, **run_kwargs)
    print(f"Adaptation started, run_id={adapt_run.run_id}, estimated credits: {adapt_run.estimated_credits_consumed}")

    try:
        adapt_run = client.datasets.wait_for_completion(dataset_id, timeout=wait_timeout)
    except Exception as exc:
        # Depending on SDK version this may be a DatasetTimeout or generic timeout.
        print(f"Adaptation wait raised: {type(exc).__name__}: {exc}")
        adapt_run = None

    if adapt_run and adapt_run.status not in ("succeeded",):
        print(f"Adaptation ended with status: {adapt_run.status}")

    print(f"Adaptation done, dataset_id={dataset_id}")

    # Step 3: Launch the AutoScientist training loop.
    create_kwargs: dict = {
        "dataset_id": dataset_id,
        "max_iterations": max_iterations,
        "target_win_rate": target_win_rate,
        "data_format": "instruction",
    }
    if model:
        create_kwargs["model"] = model
    if domain_rows is not None:
        create_kwargs["augmentation_domain_rows"] = domain_rows
    elif mean_domain_target > source_rows:
        create_kwargs["augmentation_domain_rows"] = mean_domain_target - source_rows
    if general_rows is not None:
        create_kwargs["augmentation_general_rows"] = general_rows

    print("Launching AutoScientist training loop...")
    run = client.autoscientist.create(**create_kwargs)
    experiment_id = run.id
    print(f"Training experiment started: {experiment_id}")

    print("Waiting for AutoScientist training to complete...")
    try:
        run = client.autoscientist.wait_for_completion(experiment_id, timeout=train_timeout)
    except Exception as exc:
        print(f"Training wait raised: {type(exc).__name__}: {exc}")
        # Attempt a fresh fetch of the run status.
        run = client.autoscientist.get(experiment_id)

    print(f"Training status: {run.status}")
    if run.error:
        print(f"Training error: {run.error}")

    if not run.download_available:
        print("Checkpoint not yet available (training may still be running). "
              "Use --estimate / re-run to wait for download to become available.")
        print("You can download it later with: python run.py --download-only --experiment-id", experiment_id)
        return

    # Step 4: Download the best checkpoint.
    download_path = output_dir / "best-checkpoint.tgz"
    print(f"Downloading best checkpoint to {download_path}...")
    with client.autoscientist.with_streaming_response.download(experiment_id) as response:
        response.stream_to_file(str(download_path))
    print(f"Downloaded checkpoint: {download_path} ({download_path.stat().st_size / 1e6:.1f} MB)")
    print("Done. Release with: python release.py --model_dir=outputs/autoscientist-market-analysis-lenitnes")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the AutoScientist API training loop."
    )
    parser.add_argument("--input", default="data/train.jsonl",
                        help="Path to the JSONL training dataset.")
    parser.add_argument("--output-dir", default="outputs/autoscientist-market-analysis-lenitnes",
                        help="Directory for downloaded artifacts.")
    parser.add_argument("--name", default="autoscientist-market-analysis-lenitnes-train")
    parser.add_argument("--estimate", action="store_true")
    parser.add_argument("--model", default=None,
                        help="Training model id (leave empty for platform auto-select).")
    parser.add_argument("--max-rows", type=int, default=None,
                        help="Smoke-test limit on rows to adapt before training.")
    parser.add_argument("--max-iterations", type=int, default=5)
    parser.add_argument("--target-win-rate", type=float, default=0.70,
                        help="Stop the training loop once this win rate is reached.")
    parser.add_argument("--wait-timeout", type=int, default=1800,
                        help="Timeout in seconds for the upload+adapt phase.")
    parser.add_argument("--train-timeout", type=int, default=14400,
                        help="Timeout in seconds for the AutoScientist training loop.")
    parser.add_argument("--domain-rows", type=int, default=None,
                        help="Number of domain-targeted augmentation rows.")
    parser.add_argument("--general-rows", type=int, default=None,
                        help="Number of general-diversity augmentation rows.")
    parser.add_argument("--mean-domain-target", type=int, default=20_000,
                        help="Total-domain-row target: augmentation_domain_rows = target - input rows.")
    parser.add_argument("--poll-every", type=int, default=60,
                        help="Seconds between manual status polls while waiting.")
    args = parser.parse_args()

    run_pipeline(
        input_path=Path(args.input),
        output_dir=Path(args.output_dir),
        name=args.name,
        max_iterations=args.max_iterations,
        target_win_rate=args.target_win_rate,
        estimate=args.estimate,
        model=args.model,
        max_rows=args.max_rows,
        wait_timeout=args.wait_timeout,
        train_timeout=args.train_timeout,
        domain_rows=args.domain_rows,
        general_rows=args.general_rows,
        mean_domain_target=args.mean_domain_target,
        poll_every=args.poll_every,
    )


if __name__ == "__main__":
    main()
