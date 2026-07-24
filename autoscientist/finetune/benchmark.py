import argparse
import json
import re
from pathlib import Path

import torch
from datasets import load_dataset
from peft import PeftModel
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import MultiLabelBinarizer
from transformers import AutoModelForCausalLM, AutoTokenizer


def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def parse_prediction(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


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

    if adapter_dir and (adapter_dir / "adapter_config.json").exists():
        model = PeftModel.from_pretrained(model, str(adapter_dir))
        model = model.merge_and_unload()

    model.eval()
    return model, tokenizer


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter_dir", default=None)
    parser.add_argument("--output", default="benchmark_metrics.json")
    parser.add_argument("--max_samples", type=int, default=None)
    args = parser.parse_args()

    adapter_dir = Path(args.adapter_dir) if args.adapter_dir else None
    model, tokenizer = load_model(args.base_model, adapter_dir)

    records = load_jsonl(Path(args.test_file))
    if args.max_samples:
        records = records[: args.max_samples]

    gold_labels: list[list[str]] = []
    pred_labels: list[list[str]] = []
    gold_directions: list[str] = []
    pred_directions: list[str] = []
    parsed = 0

    for record in records:
        messages = record["messages"]
        try:
            gold = json.loads(messages[-1]["content"])
        except (json.JSONDecodeError, KeyError, IndexError):
            continue

        raw = generate(model, tokenizer, messages)
        pred = parse_prediction(raw)

        gold_labels.append(list(gold.get("detector_labels", [])))
        pred_labels.append(list(pred.get("detector_labels", [])))
        gold_directions.append(gold.get("price_direction_24h", "flat"))
        pred_directions.append(pred.get("price_direction_24h", "flat"))
        if pred:
            parsed += 1

    all_labels = sorted(set(label for labels in gold_labels + pred_labels for label in labels))
    mlb = MultiLabelBinarizer(classes=all_labels)
    y_true = mlb.fit_transform(gold_labels)
    y_pred = mlb.transform(pred_labels)

    metrics = {
        "n_test": len(records),
        "parse_success_rate": round(parsed / len(records), 4) if records else 0,
        "price_direction_accuracy": round(accuracy_score(gold_directions, pred_directions), 4),
        "detector_micro_f1": round(f1_score(y_true, y_pred, average="micro", zero_division=0), 4),
        "detector_macro_f1": round(f1_score(y_true, y_pred, average="macro", zero_division=0), 4),
        "detector_exact_match": round(
            sum(set(g) == set(p) for g, p in zip(gold_labels, pred_labels)) / len(records), 4
        )
        if records
        else 0,
        "config": {
            "base_model": args.base_model,
            "adapter_dir": str(adapter_dir) if adapter_dir else None,
            "test_file": args.test_file,
        },
    }

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
