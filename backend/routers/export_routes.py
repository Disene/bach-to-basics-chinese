"""
/export/pdf  - MusicXML to PDF via music21 + LilyPond (or Audiveris)
/export/mp3  - WAV buffer to MP3 via FFmpeg
"""
import base64
import binascii
import logging
import os
import subprocess
import tempfile

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# C2 - size caps
MAX_B64_BYTES = 300 * 1024 * 1024    # 300 MB base64 string  (≈ 200 MB decoded)
MAX_WAV_BYTES = 200 * 1024 * 1024    # 200 MB decoded WAV


MAX_MUSICXML_BYTES = 10 * 1024 * 1024   # 10 MB

# M5 - WAV magic bytes: "RIFF....WAVE"
_WAV_RIFF  = b"RIFF"
_WAV_WAVE  = b"WAVE"


class ExportPdfRequest(BaseModel):
    musicxml: str


class ExportMp3Request(BaseModel):
    wav_base64: str  # base64-encoded WAV


def _rm(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


@router.post("/pdf")
async def export_pdf(req: ExportPdfRequest, background_tasks: BackgroundTasks):
    """Convert MusicXML to PDF sheet music."""
    if len(req.musicxml.encode()) > MAX_MUSICXML_BYTES:
        raise HTTPException(status_code=413, detail="MusicXML 数据过大（最大 10 MB）")
    try:
        from services.music21_svc import musicxml_to_pdf
        pdf_path = await musicxml_to_pdf(req.musicxml)
        background_tasks.add_task(_rm, pdf_path)   # H5

        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename="sheet.pdf",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'attachment; filename="sheet.pdf"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        # Surface actionable runtime errors (e.g. missing LilyPond) to the client
        # so the user knows what to install instead of seeing a generic message.
        # NOTE: musicxml_to_pdf runs in a ProcessPoolExecutor; exceptions get
        # round-tripped through pickle, so we match by message substring rather
        # than exception type (which can be wrapped / mutated on the way back).
        logger.exception("export_pdf failed")
        msg = str(e)
        if "lilypond" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "PDF 导出需要后端安装 LilyPond（默认未包含）。\n\n"
                    "快速安装：macOS 运行 brew install lilypond，Linux 运行 apt install lilypond。"
                    "Docker 请参阅 README 的“Optional: PDF export via LilyPond”章节。"
                    "未安装 LilyPond 时，MIDI 和 MusicXML 导出仍可使用。"
                ),
            )
        raise HTTPException(status_code=500, detail=f"PDF 导出失败：{msg or '未知错误'}")


@router.post("/mp3")
async def export_mp3(req: ExportMp3Request, background_tasks: BackgroundTasks):
    """Convert base64 WAV to MP3 using FFmpeg."""
    # L6 - size-check before decoding; catch malformed base64 explicitly
    if len(req.wav_base64) > MAX_B64_BYTES:
        raise HTTPException(status_code=413, detail="WAV 数据过大（最大 200 MB）")

    try:
        wav_bytes = base64.b64decode(req.wav_base64, validate=True)
    except binascii.Error:
        raise HTTPException(status_code=422, detail="Base64 编码无效")

    # C2 - check decoded size too
    if len(wav_bytes) > MAX_WAV_BYTES:
        raise HTTPException(status_code=413, detail="WAV 数据过大（最大 200 MB）")

    # M5 - validate WAV magic bytes: "RIFF....WAVE"
    if len(wav_bytes) < 12 or wav_bytes[:4] != _WAV_RIFF or wav_bytes[8:12] != _WAV_WAVE:
        raise HTTPException(status_code=422, detail="不是有效的 WAV 文件")

    try:
        wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        wav_tmp.write(wav_bytes)
        wav_tmp.close()

        mp3_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        mp3_tmp.close()

        # H5 - register cleanup regardless of success/failure
        background_tasks.add_task(_rm, wav_tmp.name)
        background_tasks.add_task(_rm, mp3_tmp.name)

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", wav_tmp.name,
                "-codec:a", "libmp3lame",
                "-q:a", "2",
                mp3_tmp.name,
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0:
            logger.error("ffmpeg failed: %s", result.stderr.decode(errors="replace")[:500])
            raise RuntimeError("ffmpeg 转换失败")

        return FileResponse(
            mp3_tmp.name,
            media_type="audio/mpeg",
            filename="export.mp3",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'attachment; filename="export.mp3"',
            },
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("export_mp3 failed")
        raise HTTPException(status_code=500, detail="MP3 导出失败，请重试。")
