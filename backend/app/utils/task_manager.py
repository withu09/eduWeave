import asyncio
import uuid
from typing import Dict, Any

class TaskManager:
    def __init__(self):
        self._tasks: Dict[str, asyncio.Task] = {}
        self._results: Dict[str, Any] = {}

    def start_task(self, coro, task_id: str = None) -> str:
        if task_id is None:
            task_id = str(uuid.uuid4())
        
        task = asyncio.create_task(coro)
        self._tasks[task_id] = task

        # Automatically clean up when done
        task.add_done_callback(lambda t: self._handle_task_done(t, task_id))
        return task_id

    def _handle_task_done(self, task: asyncio.Task, task_id: str):
        if task_id in self._tasks:
            del self._tasks[task_id]
        
        try:
            if not task.cancelled():
                self._results[task_id] = task.result()
        except Exception as e:
            self._results[task_id] = e

    def cancel_task(self, task_id: str) -> bool:
        if task_id in self._tasks:
            task = self._tasks[task_id]
            task.cancel()
            return True
        return False

    def get_status(self, task_id: str) -> str:
        if task_id in self._tasks:
            return "running"
        if task_id in self._results:
            result = self._results[task_id]
            if isinstance(result, Exception):
                return "failed"
            return "completed"
        return "unknown"

task_manager = TaskManager()
