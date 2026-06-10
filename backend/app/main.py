import io
import tempfile
import uuid
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from . import collage

app = FastAPI(title="wallpaapi")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff"}
MAX_SOURCE_DIM = 1600


def safe_image_path(raw: str) -> Path:
    path = Path(raw).expanduser().resolve()
    if path.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(400, f"not an image file: {raw}")
    if not path.is_file():
        raise HTTPException(404, f"file not found: {raw}")
    return path


@lru_cache(maxsize=256)
def load_image(raw: str) -> Optional[Image.Image]:
    try:
        img = Image.open(safe_image_path(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((MAX_SOURCE_DIM, MAX_SOURCE_DIM))
        return img
    except HTTPException:
        return None
    except OSError:
        return None


UPLOAD_ROOT = Path(tempfile.gettempdir()) / "wallpaapi_uploads"


@app.post("/api/upload")
async def upload(files: List[UploadFile] = File(...)):
    """Receive photos picked via the browser folder dialog; returns server
    paths usable with /api/thumb and /api/generate."""
    batch = UPLOAD_ROOT / uuid.uuid4().hex[:12]
    batch.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, f in enumerate(files):
        suffix = Path(f.filename or "").suffix.lower()
        if suffix not in IMAGE_EXTS:
            continue
        stem = Path(f.filename).stem[:60] or f"photo_{i}"
        dest = batch / f"{i:04d}_{stem}{suffix}"
        dest.write_bytes(await f.read())
        saved.append({"path": str(dest), "name": dest.name, "dir": str(batch)})
    if not saved:
        raise HTTPException(400, "no image files in the upload")
    return {"images": saved}


@app.get("/api/thumb")
def thumbnail(path: str, size: int = 240):
    img = Image.open(safe_image_path(path))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((size, size))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return Response(buf.getvalue(), media_type="image/jpeg",
                    headers={"Cache-Control": "max-age=3600"})


class GenerateConfig(BaseModel):
    images: List[str] = Field(min_length=1)
    width: int = Field(default=1920, ge=320, le=7680)
    height: int = Field(default=1080, ge=320, le=7680)
    template: str = "burst"            # burst | mosaic | shape
    bg_style: str = "radial"           # solid | linear | radial
    bg_color1: str = "#fdf3e0"
    bg_color2: str = "#e8c98f"
    collage_opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    density: float = Field(default=1.0, ge=0.2, le=2.5)
    polaroid: bool = True
    duplicate: bool = True
    title: str = ""
    subtitle: str = ""
    text_color: str = "#3a3530"
    text_size: float = Field(default=1.0, ge=0.3, le=2.5)
    text_spacing: float = Field(default=1.5, ge=0.0, le=6.0)
    text_box_opacity: float = Field(default=0.65, ge=0.0, le=1.0)
    shape: str = "heart"               # heart | star | circle | custom
    shape_points: Optional[List[Tuple[float, float]]] = None
    seed: int = 42


@app.post("/api/generate")
def generate(cfg: GenerateConfig):
    try:
        out = collage.generate(cfg, load_image)
    except ValueError as e:
        raise HTTPException(400, str(e))
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")
