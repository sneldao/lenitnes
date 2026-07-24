import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from adaption import Adaption


def git_commit_sha(short: bool = True) -> str | None:
    try:
        cmd = ["git", "rev-parse", "HEAD" if not short else "--short", "HEAD"]
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, cwd=Path(__file__).parent).decode().strip()
    except Exception:
        return os.environ.get("GIT_COMMIT")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def count_jsonl_lines(path: Path) -> int:
    count = 0
    with open(path) as f:
        for _ in f:
            count += 1
    return count


def write_upload_file(input_path: Path, upload_path: Path) -> None:
    with open(input_path) as src, open(upload_path, "w") as dst:
        for line in src:
            record = json.loads(line)
            messages = record.get("messages") or record.get("chat")
            new_record: dict[str, object] = {"chat": messages}
            if "metadata" in record and isinstance(record["metadata"], dict):
                new_record["metadata"] = json.dumps(record["metadata"], ensure_ascii=False)
            dst.write(json.dumps(new_record, ensure_ascii=False) + "\n")


def normalize_output(download_path: Path, output_path: Path) -> None:
    with open(download_path) as src, open(output_path, "w") as dst:
        for line in src:
            record = json.loads(line)
            messages = record.get("enhanced_chat") or record.get("chat")
            if not messages:
                raise ValueError(f"Downloaded row has no enhanced_chat or chat: {record.keys()}")
            new_record = {"messages": messages}
            if "metadata" in record and isinstance(record["metadata"], str):
                try:
                    new_record["metadata"] = json.loads(record["metadata"])
                except json.JSONDecodeError:
                    pass
            dst.write(json.dumps(new_record, ensure_ascii=False) + "\n")


def validate_adapted(output_path: Path, source_rows: int) -> bool:
    records = []
    with open(output_path) as f:
        for line in f:
            records.append(json.loads(line))

    if not records:
        raise ValueError("Adapted output is empty")

    for i, r in enumerate(records):
        messages = r.get("messages")
        if not messages:
            raise ValueError(f"Row {i}: missing messages")
        if not isinstance(messages, list):
            raise ValueError(f"Row {i}: messages is not a list")
        for m in messages:
            if not isinstance(m, dict):
                raise ValueError(f"Row {i}: message is not an object")
            role = m.get("role")
            content = m.get("content")
            if role not in {"system", "user", "assistant"}:
                raise ValueError(f"Row {i}: invalid role {role}")
            if not isinstance(content, str):
                raise ValueError(f"Row {i}: content is not a string")
        if messages[-1].get("role") != "assistant":
            raise ValueError(f"Row {i}: last message is not assistant")

    if len(records) > source_rows * 10:
        print(f"warning: adapted row count {len(records)} is much larger than source {source_rows}", file=sys.stderr)

    return True


def wait_for_rows(client: Adaption, dataset_id: str, timeout: int) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = client.datasets.get_status(dataset_id)
        if status.row_count is not None and status.row_count > 0:
            return
        time.sleep(2)
    raise TimeoutError(f"Dataset {dataset_id} did not finish ingesting within {timeout}s")


def write_provenance(
    provenance_path: Path,
    input_path: Path,
    output_path: Path,
    dataset_id: str,
    run_id: str,
    column_mapping: dict,
    max_rows: int | None,
) -> None:
    provenance = {
        "raw_train_path": str(input_path),
        "raw_train_sha256": sha256_file(input_path),
        "adapted_output_path": str(output_path),
        "adapted_output_sha256": sha256_file(output_path),
        "adaption_dataset_id": dataset_id,
        "adaption_run_id": run_id,
        "column_mapping": column_mapping,
        "max_rows": max_rows,
        "source_row_count": count_jsonl_lines(input_path),
        "adapted_row_count": count_jsonl_lines(output_path),
        "pipeline_commit": git_commit_sha(),
    }
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    with open(provenance_path, "w") as f:
        json.dump(provenance, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Adapt a raw JSONL train split using the Adaption API."
    )
    parser.add_argument("--input", default="data/train_raw.jsonl")
    parser.add_argument("--output", default="data/train.jsonl")
    parser.add_argument("--provenance", default="data/train.provenance.json")
    parser.add_argument("--name", default="autoscientist-market-analysis-lenitnes-train")
    parser.add_argument("--estimate", action="store_true")
    parser.add_argument("--max_rows", type=int, default=None, help="Smoke-test limit on rows to adapt")
    parser.add_argument("--upload_timeout", type=int, default=300)
    parser.add_argument("--run_timeout", type=int, default=1800)
    args = parser.parse_args()

    api_key = os.environ.get("ADAPTION_API_KEY")
    if not api_key:
        raise SystemExit("ADAPTION_API_KEY is required")

    client = Adaption(api_key=api_key)
    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    upload_path = input_path.with_suffix(".upload.jsonl")
    write_upload_file(input_path, upload_path)
    source_rows = count_jsonl_lines(input_path)

    upload = client.datasets.upload_file(str(upload_path), name=args.name)
    print(f"Uploaded to dataset {upload.dataset_id} ({source_rows} source rows)")

    wait_for_rows(client, upload.dataset_id, args.upload_timeout)

    column_mapping = {"chat": "chat"}
    job_spec = {"max_rows": args.max_rows} if args.max_rows else None

    if args.estimate:
        estimate_kwargs: dict = {
            "column_mapping": column_mapping,
            "estimate": True,
        }
        if job_spec:
            estimate_kwargs["job_specification"] = job_spec
        estimate = client.datasets.run(upload.dataset_id, **estimate_kwargs)
        print(f"Estimated credits: {estimate.estimated_credits_consumed}")
        return

    run_kwargs: dict = {
        "column_mapping": column_mapping,
    }
    if job_spec:
        run_kwargs["job_specification"] = job_spec
    run = client.datasets.run(upload.dataset_id, **run_kwargs)
    print(f"Started run {run.run_id}, estimated credits: {run.estimated_credits_consumed}")

    final = client.datasets.wait_for_completion(upload.dataset_id, timeout=args.run_timeout)
    print(f"Run finished: {final.status}")
    if final.error_data:
        raise SystemExit(f"Adaption run failed: {final.error_data.message}")

    url = client.datasets.download(upload.dataset_id)
    download_path = Path(args.output).with_suffix(".download.jsonl")
    with urllib.request.urlopen(url) as resp, open(download_path, "wb") as f:
        shutil.copyfileobj(resp, f)

    normalize_output(download_path, Path(args.output))
    validate_adapted(Path(args.output), source_rows)
    write_provenance(
        Path(args.provenance),
        input_path,
        Path(args.output),
        upload.dataset_id,
        run.run_id,
        column_mapping,
        args.max_rows,
    )
    print(f"Wrote adapted dataset to {args.output}")


if __name__ == "__main__":
    main()
