"""Low-level API client for Kie AI Nano Banana 2 image generation."""

import os
import time
import json
import requests
from dotenv import load_dotenv


# --- Custom Exceptions ---

class KieApiError(Exception):
    """Base exception for Kie API errors."""
    pass


class KieAuthError(KieApiError):
    """401 — invalid or missing API key."""
    pass


class KieNoCreditsError(KieApiError):
    """402 — account has no remaining credits."""
    pass


class KieRateLimitError(KieApiError):
    """429 — rate limit exceeded."""
    pass


class KieGenerationError(KieApiError):
    """501 or task failure — image generation failed."""
    pass


# --- API Client Functions ---

BASE_URL = "https://api.kie.ai/api/v1/jobs"


def load_api_key():
    """Load KIE_API_KEY from .env file."""
    load_dotenv()
    key = os.getenv("KIE_API_KEY")
    if not key:
        raise KieAuthError(
            "KIE_API_KEY not found in environment. Add it to your .env file."
        )
    return key


def _headers(api_key):
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }


def _handle_error_status(resp):
    """Raise the appropriate custom exception for error status codes."""
    if resp.status_code == 401:
        raise KieAuthError(f"Authentication failed (401): {resp.text}")
    if resp.status_code == 402:
        raise KieNoCreditsError(f"No credits remaining (402): {resp.text}")
    if resp.status_code == 429:
        raise KieRateLimitError(f"Rate limit exceeded (429): {resp.text}")
    if resp.status_code == 501:
        raise KieGenerationError(f"Generation failed (501): {resp.text}")
    if resp.status_code >= 400:
        raise KieApiError(
            f"API error ({resp.status_code}): {resp.text}"
        )


def create_task(api_key, prompt, aspect_ratio="1:1", resolution="1K",
                output_format="png", image_input=None, max_retries=3):
    """
    Submit an image generation task.

    Args:
        image_input: Optional list of image URLs to use as reference/input.

    Returns the taskId string on success.
    Retries up to max_retries times on 429 (rate limit) with exponential backoff.
    """
    url = f"{BASE_URL}/createTask"
    input_data = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "output_format": output_format,
    }
    if image_input:
        input_data["image_input"] = image_input

    payload = {
        "model": "nano-banana-2",
        "input": input_data,
    }

    for attempt in range(1, max_retries + 1):
        resp = requests.post(url, json=payload, headers=_headers(api_key),
                             timeout=30)

        if resp.status_code == 429 and attempt < max_retries:
            wait = 2 ** attempt  # 2, 4, 8 seconds
            print(f"  Rate limited, retrying in {wait}s (attempt {attempt}/{max_retries})...")
            time.sleep(wait)
            continue

        _handle_error_status(resp)
        break

    data = resp.json()
    task_id = data.get("taskId") or (data.get("data") or {}).get("taskId")
    if not task_id:
        raise KieApiError(f"No taskId in response: {json.dumps(data)}")
    return task_id


def poll_task(api_key, task_id, timeout=120, interval=2.5):
    """
    Poll a task until it completes or times out.

    Returns the full result data dict on success.
    Raises KieGenerationError on failure or timeout.
    """
    url = f"{BASE_URL}/recordInfo"
    start = time.time()

    while True:
        elapsed = time.time() - start
        if elapsed > timeout:
            raise KieGenerationError(
                f"Task {task_id} timed out after {timeout}s"
            )

        resp = requests.get(url, params={"taskId": task_id},
                            headers=_headers(api_key), timeout=30)
        _handle_error_status(resp)

        data = resp.json()
        record = data if "state" in data else (data.get("data") or {})
        state = record.get("state", "").lower()

        if state == "success":
            return record
        if state in ("fail", "failed", "error"):
            raise KieGenerationError(
                f"Task {task_id} failed: {json.dumps(record)}"
            )

        time.sleep(interval)


def download_image(url, dest_path):
    """Download an image from a URL and save it to dest_path (streaming)."""
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()

    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return dest_path
