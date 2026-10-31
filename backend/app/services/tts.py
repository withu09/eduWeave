import os
import json
import base64
import hmac
import hashlib
import time
import wave
import io
import websockets
from datetime import datetime
from urllib.parse import urlencode
from wsgiref.handlers import format_date_time
from time import mktime

class Ws_Param:
    def __init__(self, APPID, APIKey, APISecret, Text):
        self.APPID = APPID
        self.APIKey = APIKey
        self.APISecret = APISecret
        self.Text = Text
        
        # URL configuration for TTS
        self.host = "cbm01.cn-huabei-1.xf-yun.com"
        self.path = "/v1/private/mcd9m97e6"
        self.url = f"wss://{self.host}{self.path}"
        
        self.voice = os.getenv("XUNFEI_TTS_VOICE", "x6_huanlemianbao_pro")
        self.aue = os.getenv("XUNFEI_TTS_AUE", "raw") # return raw pcm

    def create_url(self):
        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))

        # build signature string
        signature_origin = "host: " + self.host + "\n"
        signature_origin += "date: " + date + "\n"
        signature_origin += "GET " + self.path + " HTTP/1.1"
        
        # HMAC-SHA256
        signature_sha = hmac.new(self.APISecret.encode('utf-8'), signature_origin.encode('utf-8'),
                                 digestmod=hashlib.sha256).digest()
        signature_sha = base64.b64encode(signature_sha).decode(encoding='utf-8')

        authorization_origin = f'api_key="{self.APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature_sha}"'
        authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode(encoding='utf-8')
        
        v = {
            "authorization": authorization,
            "date": date,
            "host": self.host
        }
        return self.url + '?' + urlencode(v)

async def synthesize_text(text: str) -> bytes:
    """
    Connects to Xunfei TTS WebSocket, sends the text, receives PCM data,
    and returns it packaged as a WAV byte array.
    """
    app_id = os.getenv("XUNFEI_TTS_APP_ID")
    api_key = os.getenv("XUNFEI_TTS_API_KEY")
    api_secret = os.getenv("XUNFEI_TTS_API_SECRET")
    
    if not all([app_id, api_key, api_secret]):
        raise ValueError("Xunfei TTS credentials missing in environment variables.")

    ws_param = Ws_Param(APPID=app_id, APIKey=api_key, APISecret=api_secret, Text=text)
    websocket_url = ws_param.create_url()
    
    pcm_data = bytearray()
    
    async with websockets.connect(websocket_url) as ws:
        d = {
            "header": {
                "app_id": ws_param.APPID,
                "status": 0
            },
            "parameter": {
                "mcd9m97e6": {
                    "accept": "audio/x-pcm",
                    "audio": {
                        "encoding": "raw",
                        "sample_rate": 16000
                    },
                    "tts": {
                        "vcn": ws_param.voice,
                        "volume": 50,
                        "speed": 50,
                        "pitch": 50,
                        "bgs": 0,
                    }
                }
            },
            "payload": {
                "text": {
                    "encoding": "utf8",
                    "status": 0,
                    "text": base64.b64encode(ws_param.Text.encode('utf-8')).decode('utf-8')
                }
            }
        }
        
        await ws.send(json.dumps(d))
        
        while True:
            res = await ws.recv()
            result = json.loads(res)
            
            header = result.get("header")
            if header.get("code") != 0:
                print(f"TTS Error: {header.get('code')} {header.get('message')}")
                break
                
            payload = result.get("payload")
            if payload:
                audio = payload.get("audio")
                if audio and audio.get("audio"):
                    audio_data = base64.b64decode(audio["audio"])
                    pcm_data.extend(audio_data)
                    
            if header.get("status") == 2:
                # Last frame received
                break
                
    # Convert PCM to WAV
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(16000)
        wav_file.writeframes(pcm_data)
        
    return wav_io.getvalue()
