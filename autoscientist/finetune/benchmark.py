import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, f1_score
from sklearn.preprocessing import MultiLabelBinarizer
from transformers import AutoModelForCausalLM, AutoTokenizer

VALID_DIRECTIONS = {"up", "down", "flat"}
VALID_ACTIONS = {"long", "short", "none"}
INVALID_DIRECTION = "__invalid__"
INVALID_LABEL = "__invalid__"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def parse_json_blob(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def normalize_prediction(pred: dict | None) -> dict:
    if pred is None:
        return {"_valid": False}

    labels = pred.get("detector_labels", [])
    direction = pred.get("price_direction_24h", "")
    action = pred.get("recommended_action", "")
    confidence = pred.get("confidence", None)

    valid_confidence = (
        isinstance(confidence, (int, float))
        and not isinstance(confidence, bool)
        and math.isfinite(confidence)
        and 0 <= confidence <= 100
    )

    if (
        not isinstance(labels, list)
        or not all(isinstance(l, str) for l in labels)
        or direction not in VALID_DIRECTIONS
        or action not in VALID_ACTIONS
        or not valid_confidence
    ):
        return {"_valid": False}

    return {
        "_valid": True,
        "detector_labels": labels,
        "price_direction_24h": direction,
        "recommended_action": action,
        "confidence": float(confidence),
    }


def load_model(base_model: str, adapter_dir: Path | None):
    if torch.cuda.is_available():
        dtype = torch.float16
    elif torch.backends.mps.is_available():
        dtype = torch.float16
    else:
        dtype = torch.float32

    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )

    adapter_hash: str | None = None
    if adapter_dir is not None:
        config_path = adapter_dir / "adapter_config.json"
        if not config_path.is_file():
            raise FileNotFoundError(f"Adapter not found: {config_path}")
        model = PeftModel.from_pretrained(model, str(adapter_dir))
        model = model.merge_and_unload()
        adapter_hash = sha256_file(config_path)

    model.eval()
    return model, tokenizer, adapter_hash


def generate(model, tokenizer, messages: list[dict]) -> str:
    prompt_messages = messages[:-1] if messages[-1]["role"] == "assistant" else messages
    inputs = tokenizer.apply_chat_template(
        prompt_messages,
        tokenize=True,
        return_tensors="pt",
        add_generation_prompt=True,
    )
    if inputs is None:
        return ""
    inputs = inputs.to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            inputs,
            max_new_tokens=256,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = outputs[0][inputs.shape[-1]:]
    return tokenizer.decode(generated, skip_special_tokens=True)


def evaluate_model(
    base_model: str,
    adapter_dir: Path | None,
    test_records: list[dict],
    max_samples: int | None = None,
) -> dict[str, Any]:
    if not test_records:
        return {
            "n_test": 0,
            "valid": 0,
            "json_extracted_rate": 0.0,
            "schema_valid_rate": 0.0,
            "price_direction_accuracy": 0.0,
            "direction_macro_f1": 0.0,
            "direction_balanced_accuracy": 0.0,
            "direction_confusion_matrix": {},
            "direction_per_class_f1": {},
            "detector_micro_f1": 0.0,
            "detector_macro_f1": 0.0,
            "detector_exact_match": 0.0,
            "config": {"base_model": base_model, "adapter_dir": str(adapter_dir) if adapter_dir else None, "adapter_hash": None},
        }

    model, tokenizer, adapter_hash = load_model(base_model, adapter_dir)
    records = test_records[:max_samples] if max_samples else test_records

    gold_labels: list[list[str]] = []
    pred_labels: list[list[str]] = []
    gold_directions: list[str] = []
    pred_directions: list[str] = []
    json_extracted = 0
    schema_valid = 0

    for record in records:
        messages = record.get("messages") or record.get("chat") or []
        if not messages:
            continue
        try:
            gold = json.loads(messages[-1]["content"])
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            continue

        raw = generate(model, tokenizer, messages)
        blob = parse_json_blob(raw)
        pred = normalize_prediction(blob)

        gold_labels.append(list(gold.get("detector_labels", [])))
        gold_directions.append(gold.get("price_direction_24h", "flat"))

        if blob is not None:
            json_extracted += 1
            if pred["_valid"]:
                schema_valid += 1
                pred_labels.append(pred["detector_labels"])
                pred_directions.append(pred["price_direction_24h"])
            else:
                pred_labels.append([INVALID_LABEL])
                pred_directions.append(INVALID_DIRECTION)
        else:
            pred_labels.append([INVALID_LABEL])
            pred_directions.append(INVALID_DIRECTION)

    n = len(gold_directions)
    if n == 0:
        return {
            "n_test": len(records),
            "valid": 0,
            "json_extracted_rate": 0.0,
            "schema_valid_rate": 0.0,
            "price_direction_accuracy": 0.0,
            "direction_macro_f1": 0.0,
            "direction_balanced_accuracy": 0.0,
            "direction_confusion_matrix": {},
            "direction_per_class_f1": {},
            "detector_micro_f1": 0.0,
            "detector_macro_f1": 0.0,
            "detector_exact_match": 0.0,
            "config": {"base_model": base_model, "adapter_dir": str(adapter_dir) if adapter_dir else None, "adapter_hash": adapter_hash},
        }

    all_labels = sorted(set(label for labels in gold_labels + pred_labels for label in labels))
    mlb = MultiLabelBinarizer(classes=all_labels)
    y_true = mlb.fit_transform(gold_labels)
    y_pred = mlb.transform(pred_labels)

    per_class_f1 = f1_score(
        gold_directions,
        pred_directions,
        labels=["up", "down", "flat"],
        average=None,
        zero_division=0,
    )
    direction_per_class = {label: round(score, 4) for label, score in zip(["up", "down", "flat"], per_class_f1)}

    metrics = {
        "n_test": len(records),
        "valid": n,
        "json_extracted_rate": round(json_extracted / n, 4),
        "schema_valid_rate": round(schema_valid / n, 4),
        "price_direction_accuracy": round(accuracy_score(gold_directions, pred_directions), 4),
        "direction_macro_f1": round(f1_score(gold_directions, pred_directions, labels=["up", "down", "flat"], average="macro", zero_division=0), 4),
        "direction_balanced_accuracy": round(balanced_accuracy_score(gold_directions, pred_directions), 4),
        "direction_confusion_matrix": confusion_matrix(gold_directions, pred_directions, labels=["up", "down", "flat"]).tolist(),
        "direction_per_class_f1": direction_per_class,
        "detector_micro_f1": round(f1_score(y_true, y_pred, average="micro", zero_division=0), 4),
        "detector_macro_f1": round(f1_score(y_true, y_pred, average="macro", zero_division=0), 4),
        "detector_exact_match": round(
            sum(set(g) == set(p) for g, p in zip(gold_labels, pred_labels)) / n, 4
        ),
        "config": {
            "base_model": base_model,
            "adapter_dir": str(adapter_dir) if adapter_dir else None,
            "adapter_hash": adapter_hash,
        },
    }
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter_dir", default=None)
    parser.add_argument("--output", default="benchmark_metrics.json")
    parser.add_argument("--max_samples", type=int, default=None)
    args = parser.parse_args()

    test_records = load_jsonl(Path(args.test_file))
    if not test_records:
        raise SystemExit(f"No test records found in {args.test_file}")

    metrics = evaluate_model(
        args.base_model,
        Path(args.adapter_dir) if args.adapter_dir else None,
        test_records,
        args.max_samples,
    )

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
