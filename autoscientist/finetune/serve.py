import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


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


def parse_repo(url: str) -> str | None:
    m = re.match(r"^https?://github\.com/([^/]+)/([^/]+)(?:/.*)?$", url)
    if m:
        return f"{m.group(1)}/{m.group(2).replace('.git', '')}"
    m = re.match(r"^([\w.-]+)/([\w.-]+)$", url)
    if m:
        return f"{m.group(1)}/{m.group(2).replace('.git', '')}"
    return None


def build_prompt(payload: dict[str, Any]) -> list[dict[str, str]]:
    repo = payload.get("repo") or parse_repo(payload.get("monitor_url", "")) or "unknown/repo"
    condition = payload.get("condition_text", "")
    evidence = payload.get("evidence", "")
    asset = payload.get("asset", "unknown")
    user_text = (
        f"Repository: {repo}\n"
        f"Monitored condition: {condition}\n"
        f"Asset: {asset}\n\n"
        f"Commits:\n{evidence}\n\n"
        "Classify the signal and predict the 24h price direction. "
        "Return a compact JSON object with keys: detector_labels, recommended_action, confidence, price_direction_24h."
    )
    return [
        {
            "role": "system",
            "content": (
                "You are a crypto code analyst. Given a GitHub repository's recent commits, "
                "classify the signal type, recommend a directional action, and predict the 24h price direction. "
                "Return a compact JSON object with keys: detector_labels, recommended_action, confidence, price_direction_24h."
            ),
        },
        {"role": "user", "content": user_text},
    ]


def parse_output(text: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {"raw": text}


def make_handler(model, tokenizer):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/predict":
                self.send_error(404)
                return
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                self.send_error(400, explain="Invalid JSON")
                return

            messages = build_prompt(payload)
            inputs = tokenizer.apply_chat_template(
                messages,
                tokenize=True,
                return_tensors="pt",
                add_generation_prompt=True,
            )
            if inputs is None:
                self.send_error(500, explain="Tokenizer failed")
                return
            inputs = inputs.to(model.device)
            with torch.no_grad():
                outputs = model.generate(
                    inputs,
                    max_new_tokens=256,
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id,
                )
            generated = outputs[0][inputs.shape[-1]:]
            raw = tokenizer.decode(generated, skip_special_tokens=True)
            result = parse_output(raw)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))

        def log_message(self, format, *args):
            print(f"[{self.log_date_time_string()}] {format % args}")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter_dir", default="outputs/autoscientist-market-analysis-lenitnes")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    adapter_dir = Path(args.adapter_dir) if args.adapter_dir else None
    model, tokenizer = load_model(args.base_model, adapter_dir)
    server = HTTPServer((args.host, args.port), make_handler(model, tokenizer))
    print(f"Serving ML inference on http://{args.host}:{args.port}/predict")
    server.serve_forever()


if __name__ == "__main__":
    main()
