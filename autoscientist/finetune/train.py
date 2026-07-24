import argparse
import json
import os
from typing import Any

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from trl import SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/train.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--output_dir", default="outputs/autoscientist-math-code-lenitnes")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--lora_r", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--max_seq_length", type=int, default=2048)
    parser.add_argument("--hub_model_id", default=None)
    return parser.parse_args()


def format_example(example: dict[str, Any], tokenizer: AutoTokenizer) -> str:
    messages = example.get("messages") or example.get("chat")
    if messages:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    if "text" in example:
        return example["text"]
    prompt = example.get("prompt", "")
    completion = example.get("completion", "")
    return f"{prompt}{completion}"


def main() -> None:
    args = parse_args()

    dataset = load_dataset("json", data_files=args.dataset, split="train")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    def to_text(example: dict[str, Any]) -> dict[str, str]:
        return {"text": format_example(example, tokenizer)}

    dataset = dataset.map(to_text, remove_columns=list(dataset.features))

    if torch.cuda.is_available():
        dtype = torch.float16
    elif torch.backends.mps.is_available():
        dtype = torch.float16
    else:
        dtype = torch.float32

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=dtype,
        trust_remote_code=True,
    )

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        logging_steps=10,
        save_strategy="epoch",
        optim="adamw_torch",
        report_to="none",
        max_grad_norm=0.3,
        remove_unused_columns=False,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=training_args,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        packing=False,
    )

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    if args.hub_model_id:
        model.push_to_hub(args.hub_model_id)
        tokenizer.push_to_hub(args.hub_model_id)
        with open(os.path.join(args.output_dir, "model_card.json"), "w") as f:
            json.dump({"model_id": args.hub_model_id, "base_model": args.base_model}, f, indent=2)


if __name__ == "__main__":
    main()
