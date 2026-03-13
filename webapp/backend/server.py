"""FastAPI backend wrapping Kie AI image generation tools."""

import asyncio
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Add project root to sys.path so tools package is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from tools.kie_api import (
    create_task,
    download_image,
    load_api_key,
    poll_task,
)
from tools.validate_input import (
    VALID_ASPECT_RATIOS,
    VALID_FORMATS,
    VALID_RESOLUTIONS,
    DEFAULTS,
)

app = FastAPI(title="Kie AI Image Generator")

from dotenv import load_dotenv
load_dotenv()
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")
UPLOADS_DIR = os.path.join(PROJECT_ROOT, ".tmp", "uploads")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

# In-memory task tracking: task_id -> {stage, message, image_url, error}
tasks: dict[str, dict] = {}
# Per-task event queues for SSE streaming
task_queues: dict[str, list[asyncio.Queue]] = {}
task_queues_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    prompt: str
    aspect_ratio: str = DEFAULTS["aspect_ratio"]
    resolution: str = DEFAULTS["resolution"]
    output_format: str = DEFAULTS["output_format"]
    image_input: list[str] = []  # List of uploaded image URLs


class GenerateResponse(BaseModel):
    task_id: str


class BulkGenerateRequest(BaseModel):
    prompts: list[str]
    aspect_ratio: str = DEFAULTS["aspect_ratio"]
    resolution: str = DEFAULTS["resolution"]
    output_format: str = DEFAULTS["output_format"]
    image_input: list[str] = []


class BulkGenerateResponse(BaseModel):
    task_ids: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(text: str, max_len: int = 48) -> str:
    """Turn a prompt into a filesystem-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:max_len]


def _push_event(task_id: str, event: dict):
    """Store latest status and push to all SSE listeners."""
    tasks[task_id] = event
    with task_queues_lock:
        queues = task_queues.get(task_id, [])
        for q in queues:
            try:
                q.put_nowait(event)
            except Exception:
                pass


def _resolve_image_urls(image_input: list[str]) -> list[str]:
    """Convert local /api/uploads/ paths to base64 data URIs for the Kie API."""
    import base64
    import mimetypes

    resolved = []
    for url in image_input:
        if url.startswith("/api/uploads/"):
            filename = url.split("/")[-1]
            fpath = os.path.join(UPLOADS_DIR, filename)
            if os.path.isfile(fpath):
                mime = mimetypes.guess_type(fpath)[0] or "image/png"
                with open(fpath, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                resolved.append(f"data:{mime};base64,{b64}")
            # skip missing files
        else:
            resolved.append(url)
    return resolved


def _generation_worker(task_id: str, prompt: str, aspect_ratio: str,
                       resolution: str, output_format: str,
                       image_input: list[str] | None = None):
    """Run the full generation pipeline (blocking). Called in a thread."""
    try:
        # Stage 1: submitting
        _push_event(task_id, {"stage": "submitting", "message": "Loading API key and submitting task..."})
        api_key = load_api_key()

        # Resolve local uploads to base64 data URIs
        resolved_images = _resolve_image_urls(image_input) if image_input else None

        kie_task_id = create_task(api_key, prompt, aspect_ratio, resolution, output_format,
                                  image_input=resolved_images)

        # Stage 2: polling
        _push_event(task_id, {"stage": "polling", "message": f"Task submitted (kie_id={kie_task_id}). Waiting for result..."})
        result = poll_task(api_key, kie_task_id)

        # Extract image URL from result (matches kie_api.py / bulk_generate.py format)
        import json as _json
        result_json = result.get("resultJson")
        if isinstance(result_json, str):
            result_json = _json.loads(result_json)
        urls = (result_json or {}).get("resultUrls", [])
        if not urls:
            urls = result.get("resultUrls", [])
        if not urls:
            # Fallback: try other common fields
            image_url = (
                result.get("output", {}).get("imageUrl")
                or result.get("imageUrl")
                or result.get("image_url")
            )
            if image_url:
                urls = [image_url]
        if not urls:
            raise RuntimeError(f"No image URL found in task result: {result}")
        image_url = urls[0]

        # Stage 3: downloading
        _push_event(task_id, {"stage": "downloading", "message": "Image ready. Downloading..."})

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = _slugify(prompt)
        ext = output_format if output_format in ("jpg", "png") else "png"
        filename = f"{timestamp}_{slug}.{ext}"
        dest = os.path.join(OUTPUT_DIR, filename)

        download_image(image_url, dest)

        # Stage 4: completed
        served_url = f"/api/images/{filename}"
        _push_event(task_id, {
            "stage": "completed",
            "message": "Image generated successfully.",
            "image_url": served_url,
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        _push_event(task_id, {
            "stage": "failed",
            "message": str(exc),
            "error": str(exc),
        })


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_SIZE = 30 * 1024 * 1024  # 30MB
MAX_UPLOAD_FILES = 14


@app.post("/api/upload")
async def upload_images(files: list[UploadFile] = File(...)):
    """Upload reference images. Returns list of URLs that can be passed to /api/generate."""
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_UPLOAD_FILES} files allowed")

    uploaded = []
    for f in files:
        if f.content_type not in ALLOWED_UPLOAD_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{f.content_type}'. Use JPEG, PNG, or WEBP."
            )
        content = await f.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail=f"File '{f.filename}' exceeds 30MB limit")

        ext = os.path.splitext(f.filename or "image.png")[1] or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOADS_DIR, filename)
        with open(dest, "wb") as out:
            out.write(content)

        # Upload to Cloudinary to get a public URL the Kie API can access
        result = cloudinary.uploader.upload(dest, folder="kie-uploads", resource_type="image")
        public_url = result["secure_url"]

        uploaded.append({
            "filename": filename,
            "url": public_url,
        })

    return uploaded


@app.get("/api/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded reference image."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(UPLOADS_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Upload not found")
    return FileResponse(fpath)


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Start an image generation task in the background."""
    # Validate inputs
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt must not be empty")
    if req.aspect_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail=f"Invalid aspect_ratio. Valid: {sorted(VALID_ASPECT_RATIOS)}")
    if req.resolution not in VALID_RESOLUTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid resolution. Valid: {sorted(VALID_RESOLUTIONS)}")
    if req.output_format not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid output_format. Valid: {sorted(VALID_FORMATS)}")

    task_id = str(uuid.uuid4())
    tasks[task_id] = {"stage": "submitting", "message": "Queued for processing."}

    thread = threading.Thread(
        target=_generation_worker,
        args=(task_id, req.prompt.strip(), req.aspect_ratio, req.resolution, req.output_format,
              req.image_input),
        daemon=True,
    )
    thread.start()

    return GenerateResponse(task_id=task_id)


@app.post("/api/bulk-generate", response_model=BulkGenerateResponse)
async def bulk_generate(req: BulkGenerateRequest):
    """Start multiple image generation tasks simultaneously."""
    prompts = [p.strip() for p in req.prompts if p.strip()]
    if not prompts:
        raise HTTPException(status_code=400, detail="prompts must not be empty")
    if len(prompts) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 prompts at a time")
    if req.aspect_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail=f"Invalid aspect_ratio. Valid: {sorted(VALID_ASPECT_RATIOS)}")
    if req.resolution not in VALID_RESOLUTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid resolution. Valid: {sorted(VALID_RESOLUTIONS)}")
    if req.output_format not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid output_format. Valid: {sorted(VALID_FORMATS)}")

    task_ids = []
    for prompt in prompts:
        task_id = str(uuid.uuid4())
        tasks[task_id] = {"stage": "submitting", "message": "Queued for processing."}
        thread = threading.Thread(
            target=_generation_worker,
            args=(task_id, prompt, req.aspect_ratio, req.resolution, req.output_format,
                  req.image_input),
            daemon=True,
        )
        thread.start()
        task_ids.append(task_id)

    return BulkGenerateResponse(task_ids=task_ids)


@app.get("/api/status/{task_id}")
async def task_status(task_id: str):
    """SSE endpoint that streams progress events until the task completes."""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    queue: asyncio.Queue = asyncio.Queue()

    with task_queues_lock:
        task_queues.setdefault(task_id, []).append(queue)

    async def event_stream():
        try:
            # Send current status immediately
            current = tasks.get(task_id)
            if current:
                yield {"event": "status", "data": _event_json(current)}
                if current["stage"] in ("completed", "failed"):
                    return

            # Stream updates until terminal state
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=120)
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield {"event": "ping", "data": "{}"}
                    continue

                yield {"event": "status", "data": _event_json(event)}
                if event["stage"] in ("completed", "failed"):
                    return
        finally:
            with task_queues_lock:
                queues = task_queues.get(task_id, [])
                if queue in queues:
                    queues.remove(queue)
                if not queues:
                    task_queues.pop(task_id, None)

    return EventSourceResponse(event_stream())


def _event_json(event: dict) -> str:
    import json
    return json.dumps(event)


@app.get("/api/gallery")
async def gallery():
    """List all images in the output directory, newest first."""
    if not os.path.isdir(OUTPUT_DIR):
        return []

    images = []
    for fname in os.listdir(OUTPUT_DIR):
        fpath = os.path.join(OUTPUT_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        ext = os.path.splitext(fname)[1].lower()
        if ext not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        stat = os.stat(fpath)
        images.append({
            "filename": fname,
            "created": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
            "url": f"/api/images/{fname}",
        })

    images.sort(key=lambda x: x["created"], reverse=True)
    return images


@app.get("/api/images/{filename}")
async def serve_image(filename: str):
    """Serve an image file from the output directory."""
    # Prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    fpath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(fpath)


@app.delete("/api/gallery")
async def clear_gallery():
    """Delete all images from the output directory."""
    deleted = 0
    for fname in os.listdir(OUTPUT_DIR):
        fpath = os.path.join(OUTPUT_DIR, fname)
        if os.path.isfile(fpath) and os.path.splitext(fname)[1].lower() in (".png", ".jpg", ".jpeg", ".webp"):
            os.remove(fpath)
            deleted += 1
    return {"detail": f"deleted {deleted} images"}


@app.delete("/api/gallery/{filename}")
async def delete_image(filename: str):
    """Delete an image from the output directory."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    fpath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Image not found")

    os.remove(fpath)
    return {"detail": "deleted", "filename": filename}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
