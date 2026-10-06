"""
/fingering/generate - MusicXML to annotated MusicXML with finger numbers
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_MUSICXML_BYTES = 10 * 1024 * 1024   # 10 MB - large scores are ~500 KB


class FingeringRequest(BaseModel):
    musicxml: str


@router.post("/generate")
async def generate_fingering(req: FingeringRequest):
    """Run pianoplayer Parncutt algorithm on MusicXML, returns annotated MusicXML."""
    if len(req.musicxml.encode()) > MAX_MUSICXML_BYTES:
        raise HTTPException(status_code=413, detail="MusicXML 数据过大（最大 10 MB）")
    try:
        from services.pianoplayer_svc import annotate_fingering
        annotated = await annotate_fingering(req.musicxml)
        return JSONResponse(
            {"musicxml": annotated},
            headers={"Cache-Control": "no-store"},
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("generate_fingering failed")
        raise HTTPException(
            status_code=500,
            detail="指法生成失败，请重试。",
        )
