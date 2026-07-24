import argparse
import json
import random
from datetime import datetime
from pathlib import Path


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_records(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def detected_at(record: dict) -> str | None:
    return record.get("metadata", {}).get("detected_at")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/all.jsonl")
    parser.add_argument("--train", default="data/train.jsonl")
    parser.add_argument("--test", default="data/test.jsonl")
    parser.add_argument("--test_cutoff", default=None, help="ISO date; records after this go to test")
    parser.add_argument("--test_ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    records = load_records(Path(args.input))
    if not records:
        raise SystemExit(f"No records found in {args.input}")

    if args.test_cutoff:
        cutoff = parse_iso(args.test_cutoff)
        train_records = [r for r in records if parse_iso(detected_at(r) or "1970-01-01T00:00:00Z") <= cutoff]
        test_records = [r for r in records if parse_iso(detected_at(r) or "1970-01-01T00:00:00Z") > cutoff]
    else:
        random.seed(args.seed)
        shuffled = records[:]
        random.shuffle(shuffled)
        split = int(len(shuffled) * (1 - args.test_ratio))
        train_records = shuffled[:split]
        test_records = shuffled[split:]

    for out_path, subset in [(args.train, train_records), (args.test, test_records)]:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            for r in subset:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"train: {len(train_records)} examples -> {args.train}")
    print(f"test:  {len(test_records)} examples -> {args.test}")


if __name__ == "__main__":
    main()
