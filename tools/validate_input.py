"""Input file validation for bulk image generation."""

import csv
import os

VALID_ASPECT_RATIOS = {"1:1", "2:3", "3:2", "4:3", "9:16", "16:9", "21:9", "auto"}
VALID_RESOLUTIONS = {"1K", "2K", "4K"}
VALID_FORMATS = {"jpg", "png"}

DEFAULTS = {
    "aspect_ratio": "1:1",
    "resolution": "1K",
    "output_format": "png",
}


def validate_row(row, row_num):
    """
    Validate a single prompt row. Returns (cleaned_row, errors).

    row is a dict with keys: prompt, aspect_ratio, resolution, output_format.
    """
    errors = []
    cleaned = {}

    prompt = row.get("prompt", "").strip()
    if not prompt:
        errors.append(f"Row {row_num}: prompt is empty")
    cleaned["prompt"] = prompt

    ar = row.get("aspect_ratio", "").strip() or DEFAULTS["aspect_ratio"]
    if ar not in VALID_ASPECT_RATIOS:
        errors.append(
            f"Row {row_num}: invalid aspect_ratio '{ar}' "
            f"(valid: {', '.join(sorted(VALID_ASPECT_RATIOS))})"
        )
    cleaned["aspect_ratio"] = ar

    res = row.get("resolution", "").strip() or DEFAULTS["resolution"]
    if res not in VALID_RESOLUTIONS:
        errors.append(
            f"Row {row_num}: invalid resolution '{res}' "
            f"(valid: {', '.join(sorted(VALID_RESOLUTIONS))})"
        )
    cleaned["resolution"] = res

    fmt = row.get("output_format", "").strip() or DEFAULTS["output_format"]
    if fmt not in VALID_FORMATS:
        errors.append(
            f"Row {row_num}: invalid output_format '{fmt}' "
            f"(valid: {', '.join(sorted(VALID_FORMATS))})"
        )
    cleaned["output_format"] = fmt

    return cleaned, errors


def load_prompts(file_path):
    """
    Load prompts from a CSV or TXT file.

    CSV must have a 'prompt' column. Optional columns: aspect_ratio, resolution, output_format.
    TXT has one prompt per line.

    Returns (list_of_row_dicts, list_of_errors).
    """
    if not os.path.exists(file_path):
        return [], [f"File not found: {file_path}"]

    ext = os.path.splitext(file_path)[1].lower()
    rows = []
    all_errors = []

    if ext == ".csv":
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if "prompt" not in (reader.fieldnames or []):
                return [], [f"CSV file must have a 'prompt' column. Found: {reader.fieldnames}"]
            for i, raw_row in enumerate(reader, start=2):  # row 1 is header
                row = {
                    "prompt": raw_row.get("prompt", ""),
                    "aspect_ratio": raw_row.get("aspect_ratio", ""),
                    "resolution": raw_row.get("resolution", ""),
                    "output_format": raw_row.get("output_format", ""),
                }
                cleaned, errs = validate_row(row, i)
                all_errors.extend(errs)
                if not errs:
                    rows.append(cleaned)
    elif ext == ".txt":
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for i, line in enumerate(lines, start=1):
            prompt = line.strip()
            if not prompt:
                continue  # skip blank lines
            row = {"prompt": prompt, "aspect_ratio": "", "resolution": "",
                   "output_format": ""}
            cleaned, errs = validate_row(row, i)
            all_errors.extend(errs)
            if not errs:
                rows.append(cleaned)
    else:
        return [], [f"Unsupported file format '{ext}'. Use .csv or .txt"]

    if not rows and not all_errors:
        all_errors.append("No valid prompts found in file.")

    return rows, all_errors
