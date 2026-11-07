from fastapi import APIRouter, HTTPException
from app.utils.telemetry import recent_calls

router = APIRouter(prefix="/api/console", tags=["Real agent calls"])


@router.get("/calls")
async def get_calls():
    try:
        return {"calls": await recent_calls()}
    except Exception:
        raise HTTPException(503, "暂时无法读取调用记录，请检查记录服务")
