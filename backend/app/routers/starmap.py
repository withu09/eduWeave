from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.schemas.conversation import ChatTurn, model_history
from app.utils.telemetry import tracked_run

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
    query: str = Field(min_length=1, max_length=8000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)

class SocraticRequest(DefaultRequest):
    stage: str

class ProRequest(DefaultRequest):
    pass

@router.post("/default", response_model=DefaultResult)
async def run_default_mode(req: DefaultRequest):
    """
    Runs the xfyun织星 (learnanything) mode.
    Returns the parsed LearnIntent and structured LearnModules.
    """
    try:
        # Pass the query to the agent
        prompt = f"用户请求：{req.query}"
        result = await tracked_run('Encyclopedia', f'生成结构化课程：{req.query[:120]}', default_starmap_agent.run(prompt, message_history=model_history(req.history)))
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
        previous_messages = model_history(req.history)
            
        if req.stage == "inquire":
            result = await tracked_run('Inquirer', f'启发式追问：{req.query[:120]}', inquirer_agent.run(prompt, message_history=previous_messages))
        elif req.stage == "tdd":
            result = await tracked_run('Challenger', f'生成微型挑战：{req.query[:120]}', challenger_agent.run(prompt, message_history=previous_messages))
        elif req.stage == "synthesize":
            result = await tracked_run('Synthesizer', f'总结学习内容：{req.query[:120]}', synthesizer_agent.run(prompt, message_history=previous_messages))
        else:
            # Fallback
            result = await tracked_run('Inquirer', f'启发式追问：{req.query[:120]}', inquirer_agent.run(prompt, message_history=previous_messages))
            
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
        result = await tracked_run('Presenter', f'生成专题学习网页：{req.query[:120]}', pro_starmap_agent.run(prompt, message_history=model_history(req.history)))
        return getattr(result, "data", getattr(result, "output", None))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
