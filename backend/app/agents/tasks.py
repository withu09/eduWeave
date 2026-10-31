from celery import Celery
import time
from app.core import settings

celery_app = Celery("eduweave_tasks", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

@celery_app.task(bind=True)
def generate_heavy_media(self, node_id: str):
    # Simulates Manim video rendering
    self.update_state(state="PROGRESS", meta={"percent": 10, "status": "Script generation"})
    time.sleep(1.0)
    self.update_state(state="PROGRESS", meta={"percent": 50, "status": "Manim animation render"})
    time.sleep(1.0)
    self.update_state(state="PROGRESS", meta={"percent": 90, "status": "Audio synchronization"})
    time.sleep(0.5)
    return {
        "status": "SUCCESS",
        "node_id": node_id,
        "media_url": f"/files/videos/{node_id}.mp4",
        "markdown": "# Topic Guide\nThis is the dynamic guide for the topic."
    }
