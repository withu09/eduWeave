from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.starmap_agents import (
    default_starmap_agent,
    inquirer_agent,
    challenger_agent,
    synthesizer_agent,
    pro_starmap_agent,
    DefaultResult,
    SocraticResult,
    ProResult
)

router = APIRouter(prefix="/api/starmap", tags=["Star Map Encyclopedia"])

class DefaultRequest(BaseModel):
    query: str

class SocraticRequest(BaseModel):
    query: str
    stage: str
    history: List[Dict[str, Any]] = []

class ProRequest(BaseModel):
    query: str

@router.post("/default", response_model=DefaultResult)
async def run_default_mode(req: DefaultRequest):
    """
    Runs the xfyun织星 (learnanything) mode.
    Returns the parsed LearnIntent and structured LearnModules.
    """
    try:
        # Pass the query to the agent
        prompt = f"用户请求：{req.query}"
        result = await default_starmap_agent.run(prompt)
        return getattr(result, "data", getattr(result, "output", None))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/socratic", response_model=SocraticResult)
async def run_socratic_mode(req: SocraticRequest):
    """
    Runs the xfyun织星-苏格拉底 mode.
    Routes to Inquirer, Challenger, or Synthesizer based on `stage`.
    """
    try:
        prompt = f"用户当前输入：{req.query}\n"
        if req.history:
            # Simplistic context injection
            history_str = "\n".join([f"[{m.get('role', 'unknown')}]: {m.get('text', '')}" for m in req.history[-5:]])
            prompt += f"\n历史对话参考：\n{history_str}"
            
        if req.stage == "inquire":
            result = await inquirer_agent.run(prompt)
        elif req.stage == "tdd":
            result = await challenger_agent.run(prompt)
        elif req.stage == "synthesize":
            result = await synthesizer_agent.run(prompt)
        else:
            # Fallback
            result = await inquirer_agent.run(prompt)
            
        return getattr(result, "data", getattr(result, "output", None))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pro", response_model=ProResult)
async def run_pro_mode(req: ProRequest):
    """
    Runs the xfyun织星 Pro mode.
    Creates a full bespoke website and returns HTML along with the execution steps.
    """
    try:
        prompt = f"用户建站需求：{req.query}"
        result = await pro_starmap_agent.run(prompt)
        return getattr(result, "data", getattr(result, "output", None))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
