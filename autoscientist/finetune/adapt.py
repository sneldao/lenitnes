import argparse
import json
import os
import shutil
import time
import urllib.request
from pathlib import Path

from adaption import Adaption


def load_records(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def write_upload_file(input_path: Path, upload_path: Path) -> None:
    with open(input_path) as src, open(upload_path, "w") as dst:
        for line in src:
            record = json.loads(line)
            messages = record.pop("messages", None) or record.pop("chat", None)
            new_record: dict[str, object] = {"chat": messages}
            if "metadata" in record and isinstance(record["metadata"], dict):
                detected_at = record["metadata"].get("detected_at")
                if detected_at:
                    new_record["detected_at"] = detected_at
            dst.write(json.dumps(new_record, ensure_ascii=False) + "\n")


def normalize_output(download_path: Path, output_path: Path) -> None:
    with open(download_path) as src, open(output_path, "w") as dst:
        for line in src:
            record = json.loads(line)
            if "chat" in record and "messages" not in record:
                record["messages"] = record.pop("chat")
            dst.write(json.dumps(record, ensure_ascii=False) + "\n")


def wait_for_rows(client: Adaption, dataset_id: str, timeout: int) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = client.datasets.get_status(dataset_id)
        if status.row_count is not None and status.row_count > 0:
            return
        time.sleep(2)
    raise TimeoutError(f"Dataset {dataset_id} did not finish ingesting within {timeout}s")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/all.jsonl")
    parser.add_argument("--output", default="data/adapted.jsonl")
    parser.add_argument("--name", default="autoscientist-lenitnes-math-code")
    parser.add_argument("--estimate", action="store_true")
    parser.add_argument("--upload_timeout", type=int, default=300)
    parser.add_argument("--run_timeout", type=int, default=1800)
    args = parser.parse_args()

    api_key = os.environ.get("ADAPTION_API_KEY")
    if not api_key:
        raise SystemExit("ADAPTION_API_KEY is required")

    client = Adaption(api_key=api_key)
    input_path = Path(args.input)
    upload_path = input_path.with_suffix(".upload.jsonl")

    write_upload_file(input_path, upload_path)
    upload = client.datasets.upload_file(str(upload_path), name=args.name)
    print(f"Uploaded to dataset {upload.dataset_id}")

    wait_for_rows(client, upload.dataset_id, args.upload_timeout)

    if args.estimate:
        estimate = client.datasets.run(
            upload.dataset_id,
            column_mapping={"chat": "chat"},
            estimate=True,
        )
        print(f"Estimated credits: {estimate.estimated_credits_consumed}")
        return

    run = client.datasets.run(
        upload.dataset_id,
        column_mapping={"chat": "chat"},
    )
    print(f"Started run {run.run_id}, estimated credits: {run.estimated_credits_consumed}")

    final = client.datasets.wait_for_completion(upload.dataset_id, timeout=args.run_timeout)
    print(f"Run finished: {final.status}")
    if final.error:
        raise SystemExit(f"Adaption run failed: {final.error}")

    url = client.datasets.download(upload.dataset_id)
    download_path = Path(args.output).with_suffix(".download.jsonl")
    with urllib.request.urlopen(url) as resp, open(download_path, "wb") as f:
        shutil.copyfileobj(resp, f)

    normalize_output(download_path, Path(args.output))
    print(f"Wrote adapted dataset to {args.output}")


if __name__ == "__main__":
    main()
