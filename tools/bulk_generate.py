"""Bulk image generation CLI using Kie AI Nano Banana 2."""

import argparse
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Allow running from project root or tools/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.kie_api import (
    load_api_key, create_task, poll_task, download_image,
    KieApiError, KieAuthError, KieNoCreditsError,
)
from tools.validate_input import load_prompts


def sanitize_filename(prompt, max_len=50):
    """Convert a prompt to a safe, truncated filename slug."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", prompt.lower()).strip("-")
    return slug[:max_len]


def process_single(api_key, row, index, output_dir):
    """Generate one image: create → poll → download. Returns (index, path, None) or (index, None, error)."""
    prompt = row["prompt"]
    label = f"[{index:04d}] {prompt[:60]}"
    try:
        print(f"  Submitting {label}...")
        task_id = create_task(
            api_key, prompt,
            aspect_ratio=row["aspect_ratio"],
            resolution=row["resolution"],
            output_format=row["output_format"],
        )
        print(f"  Polling    {label} (task {task_id})...")
        result = poll_task(api_key, task_id)

        # Extract image URL from result
        result_json = result.get("resultJson")
        if isinstance(result_json, str):
            result_json = json.loads(result_json)
        urls = (result_json or {}).get("resultUrls", [])
        if not urls:
            # Fallback: check top-level result fields
            urls = result.get("resultUrls", [])
        if not urls:
            raise KieApiError(f"No image URLs in result: {json.dumps(result)}")

        image_url = urls[0]
        ext = row["output_format"]
        filename = f"{index:04d}_{sanitize_filename(prompt)}.{ext}"
        dest = os.path.join(output_dir, filename)

        print(f"  Downloading {label}...")
        download_image(image_url, dest)
        print(f"  Done       {label} → {filename}")
        return index, dest, None

    except Exception as e:
        print(f"  FAILED     {label}: {e}")
        return index, None, str(e)


def write_failures(output_dir, failures):
    """Write failed prompts to _failures.csv for easy re-run."""
    if not failures:
        return None
    path = os.path.join(output_dir, "_failures.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["prompt", "aspect_ratio", "resolution", "output_format", "error"])
        writer.writeheader()
        for row, error in failures:
            writer.writerow({**row, "error": error})
    return path


def write_run_state(rows, results, elapsed, output_dir):
    """Write run state to .tmp/run_state.json for resumability."""
    tmp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    state = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total": len(rows),
        "succeeded": sum(1 for _, path, _ in results if path),
        "failed": sum(1 for _, path, _ in results if not path),
        "elapsed_seconds": round(elapsed, 1),
        "output_dir": os.path.abspath(output_dir),
        "results": [
            {"index": idx, "path": path, "error": err}
            for idx, path, err in results
        ],
    }
    state_path = os.path.join(tmp_dir, "run_state.json")
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    return state_path


def main():
    parser = argparse.ArgumentParser(
        description="Bulk image generation using Kie AI Nano Banana 2"
    )
    parser.add_argument("-i", "--input", required=True,
                        help="Path to CSV or TXT file with prompts")
    parser.add_argument("-o", "--output", default="output/",
                        help="Output directory (default: output/)")
    parser.add_argument("-c", "--concurrency", type=int, default=3,
                        help="Max parallel tasks (default: 3)")
    parser.add_argument("--aspect-ratio",
                        help="Override aspect ratio for all prompts")
    parser.add_argument("--resolution",
                        help="Override resolution for all prompts")
    parser.add_argument("--format",
                        help="Override output format for all prompts")
    parser.add_argument("--skip-errors", action="store_true",
                        help="Continue on validation errors")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate input only, don't generate")

    args = parser.parse_args()

    # Load and validate input
    rows, errors = load_prompts(args.input)
    if errors:
        print("Validation errors:")
        for e in errors:
            print(f"  - {e}")
        if not args.skip_errors:
            print("\nAborting. Use --skip-errors to continue with valid prompts.")
            sys.exit(1)
        print(f"\n--skip-errors: continuing with {len(rows)} valid prompt(s).\n")

    if not rows:
        print("No valid prompts to process.")
        sys.exit(1)

    # Apply CLI overrides
    for row in rows:
        if args.aspect_ratio:
            row["aspect_ratio"] = args.aspect_ratio
        if args.resolution:
            row["resolution"] = args.resolution
        if args.format:
            row["output_format"] = args.format

    # Summary
    print(f"Prompts: {len(rows)}")
    print(f"Output:  {args.output}")
    print(f"Concurrency: {args.concurrency}")
    sample = rows[0]
    print(f"Settings: {sample['aspect_ratio']} / {sample['resolution']} / {sample['output_format']}")
    print()

    if args.dry_run:
        print("Dry run complete. All prompts validated successfully.")
        for i, row in enumerate(rows, 1):
            print(f"  {i:04d}: {row['prompt'][:80]}")
        sys.exit(0)

    # Load API key
    try:
        api_key = load_api_key()
    except KieAuthError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Execute in parallel
    start_time = time.time()
    results = []
    failures = []

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(process_single, api_key, row, i, args.output): (i, row)
            for i, row in enumerate(rows, 1)
        }
        for future in as_completed(futures):
            idx, path, error = future.result()
            results.append((idx, path, error))
            if error:
                row = futures[future][1]
                failures.append((row, error))

    elapsed = time.time() - start_time
    results.sort(key=lambda x: x[0])

    # Summary
    succeeded = sum(1 for _, p, _ in results if p)
    failed = sum(1 for _, p, _ in results if not p)
    print(f"\n{'='*50}")
    print(f"Completed in {elapsed:.1f}s")
    print(f"  Succeeded: {succeeded}")
    print(f"  Failed:    {failed}")

    # Write failures CSV
    if failures:
        fail_path = write_failures(args.output, failures)
        print(f"  Failures saved to: {fail_path}")

    # Write run state
    state_path = write_run_state(rows, results, elapsed, args.output)
    print(f"  Run state saved to: {state_path}")

    if failed and not args.skip_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
