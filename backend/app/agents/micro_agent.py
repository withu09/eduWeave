import asyncio
from typing import Dict, Any, List
from app.agents.orchestrator import StudentProfile

class ProfileMerger:
    @staticmethod
    def merge_weaknesses(current_profile: StudentProfile, new_weakspots: List[str]) -> StudentProfile:
        merged = set(current_profile.weaknesses) | set(new_weakspots)
        current_profile.weaknesses = list(merged)
        return current_profile

class MicroAgentDispatcher:
    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    async def execute_task(self, task_description: str) -> Dict[str, Any]:
        await asyncio.sleep(0.5)  # Simulate agent thought loop
        if self.agent_name == "Examiner":
            return {"new_weakspots": ["binary_search_tree"]}
        return {"new_weakspots": []}

async def run_parallel_agents_with_merge(profile: StudentProfile, task: str) -> StudentProfile:
    examiner = MicroAgentDispatcher("Examiner")
    tutoring = MicroAgentDispatcher("Tutoring")
    
    # Run in parallel using asyncio.gather
    results = await asyncio.gather(
        examiner.execute_task(task),
        tutoring.execute_task(task)
    )
    
    # Run the merger step
    for res in results:
        new_spots = res.get("new_weakspots", [])
        profile = ProfileMerger.merge_weaknesses(profile, new_spots)
        
    return profile
