from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from app.services.tts import synthesize_text

router = APIRouter()

class TTSRequest(BaseModel):
    text: str

@router.post("/api/tts/synthesize")
async def tts_synthesize(req: TTSRequest):
    """
    Synthesize text into speech and return a WAV file.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        wav_bytes = await synthesize_text(req.text)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        print(f"TTS Synthesis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
