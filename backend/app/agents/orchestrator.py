import re
import json
import inspect
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from app.core import settings

from app.schemas.profile import StudentProfile, CourseTopic

class StudyPlan(BaseModel):
    nodes: list[CourseTopic]
    description: str

def fallback_json_parser(raw_text: str) -> dict:
    # Strip markdown codeblocks
    match = re.search(r"```json\s*(.*?)\s*```", raw_text, re.DOTALL)
    if match:
        raw_text = match.group(1)
    else:
        raw_text = raw_text.strip("`").strip()
    return json.loads(raw_text)

import httpx

class SparkCompatTransport(httpx.AsyncHTTPTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        print(f"[SparkCompatTransport] Request: {request.method} {request.url}")
        if request.content:
            try:
                print(f"[SparkCompatTransport] Request Body:\n{request.content.decode('utf-8')}")
            except Exception:
                pass
        try:
            response = await super().handle_async_request(request)
            print(f"[SparkCompatTransport] Response Status: {response.status_code}")
        except Exception as err:
            print(f"[SparkCompatTransport] Request failed: {type(err).__name__} - {err}")
            raise err
        
        # Intercept and patch JSON or SSE response from Xunfei Spark
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            await response.aread()
            print(f"[SparkCompatTransport] Raw Response Body:\n{response.content.decode('utf-8')}")
            try:
                data = json.loads(response.content)
                if isinstance(data, dict) and "choices" in data:
                    modified = False
                    if "id" not in data or data["id"] is None:
                        data["id"] = data.get("sid") or "chatcmpl-spark"
                        modified = True
                    if "object" not in data or data["object"] is None:
                        data["object"] = "chat.completion"
                        modified = True
                    if "model" not in data or data["model"] is None:
                        data["model"] = settings.XUNFEI_SPARK_MODEL or "4.0Ultra"
                        modified = True
                    
                    for choice in data["choices"]:
                        if "finish_reason" not in choice or choice["finish_reason"] is None:
                            if choice.get("message", {}).get("tool_calls"):
                                choice["finish_reason"] = "tool_calls"
                            else:
                                choice["finish_reason"] = "stop"
                            modified = True
                        
                        message = choice.get("message", {})
                        if "tool_calls" in message and message["tool_calls"]:
                            for tool_call in message["tool_calls"]:
                                func = tool_call.get("function", {})
                                if "arguments" in func and func["arguments"]:
                                    try:
                                        import json_repair
                                        # Use json_repair to handle broken JSON (e.g. unescaped quotes, missing brackets)
                                        parsed_args = json_repair.loads(func["arguments"])
                                        sanitized = json.dumps(parsed_args, ensure_ascii=False)
                                        if func["arguments"] != sanitized:
                                            func["arguments"] = sanitized
                                            modified = True
                                    except Exception as e:
                                        print(f"[SparkCompatTransport] Error sanitizing tool call arguments: {e}")
                        elif message.get("content"):
                            # Handle case where model outputs JSON in content instead of tool_calls
                            raw_text = message["content"]
                            if "{" in raw_text:
                                try:
                                    import json_repair
                                    import uuid
                                    parsed = json_repair.loads(raw_text)
                                    if isinstance(parsed, dict):
                                        message["tool_calls"] = [{
                                            "id": f"Call_{uuid.uuid4().hex[:16]}",
                                            "type": "function",
                                            "function": {
                                                "name": "final_result",
                                                "arguments": json.dumps(parsed, ensure_ascii=False)
                                            }
                                        }]
                                        message["content"] = None
                                        choice["finish_reason"] = "tool_calls"
                                        modified = True
                                        print("[SparkCompatTransport] Force-converted plain text JSON to tool_calls!")
                                except Exception as e:
                                    pass
                    
                    if modified:
                        new_content = json.dumps(data).encode("utf-8")
                        response._content = new_content
                        response.headers["content-length"] = str(len(new_content))
                        print("[SparkCompatTransport] Successfully patched missing fields in response.")
                        print(f"[SparkCompatTransport] Patched Response Body:\n{new_content.decode('utf-8')}")
            except Exception as e:
                print(f"[SparkCompatTransport] Patching exception: {e}")
        
        elif "text/event-stream" in content_type:
            print("[SparkCompatTransport] Intercepting SSE stream.")
            async def patched_generator():
                async for line in response.aiter_lines():
                    print(f"[SparkCompatTransport] RAW LINE: {line}", flush=True)
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            yield (line + "\n").encode("utf-8")
                            continue
                        try:
                            data = json.loads(data_str)
                            if isinstance(data, dict):
                                modified = False
                                if "id" not in data or data["id"] is None:
                                    data["id"] = data.get("sid") or "chatcmpl-spark"
                                    modified = True
                                if "object" not in data or data["object"] is None:
                                    data["object"] = "chat.completion.chunk"
                                    modified = True
                                if "model" not in data or data["model"] is None:
                                    data["model"] = settings.XUNFEI_SPARK_MODEL or "4.0Ultra"
                                    modified = True
                                if "choices" in data:
                                    for choice in data["choices"]:
                                        delta = choice.get("delta", {})
                                        if "tool_calls" in delta and delta.get("content") == "":
                                            delta.pop("content", None)
                                            modified = True
                                            
                                if modified:
                                    yield f"data: {json.dumps(data)}\n".encode("utf-8")
                                    continue
                        except Exception:
                            pass
                    
                    yield (line + "\n").encode("utf-8")
            
            return httpx.Response(
                status_code=response.status_code,
                headers=response.headers,
                content=patched_generator(),
                request=request
            )
            
        return response

async def require_bailian_key(request: httpx.Request):
    """Allow interface preview without sending unconfigured model requests."""
    if not settings.DASHSCOPE_API_KEY:
        raise ValueError("请先在 .env.bailian 中填写 DASHSCOPE_API_KEY，再重新启动服务。")


# Keep the existing export names so every agent shares the selected provider.
# Bailian already returns OpenAI-compatible responses and must bypass Spark rewriting.
if settings.LLM_PROVIDER.lower() in {"bailian", "dashscope", "aliyun"}:
    spark_provider = OpenAIProvider(
        base_url=settings.DASHSCOPE_BASE_URL,
        api_key=settings.DASHSCOPE_API_KEY or "not-configured",
        http_client=httpx.AsyncClient(timeout=120.0, event_hooks={"request": [require_bailian_key]}),
    )
    spark_model = OpenAIModel(
        model_name=settings.DASHSCOPE_MODEL,
        provider=spark_provider,
        settings={"extra_body": {"enable_thinking": False}},
    )
elif settings.LLM_PROVIDER.lower() == "xunfei":
    spark_provider = OpenAIProvider(
        base_url=settings.XUNFEI_SPARK_BASE_URL,
        api_key=f"{settings.XUNFEI_SPARK_API_KEY}:{settings.XUNFEI_SPARK_API_SECRET}" if settings.XUNFEI_SPARK_API_KEY and settings.XUNFEI_SPARK_API_SECRET else "placeholder",
        http_client=httpx.AsyncClient(transport=SparkCompatTransport(), timeout=120.0),
    )
    spark_model = OpenAIModel(
        model_name=settings.XUNFEI_SPARK_MODEL,
        provider=spark_provider,
    )
else:
    raise ValueError("LLM_PROVIDER must be bailian or xunfei")

# Version-resilient Agent keyword arguments (pydantic-ai >= 0.8.0 uses output_type)
agent_kwargs = {
    "model": spark_model,
    "system_prompt": "You are the Director Agent. Based on the StudentProfile, output a concise StudyPlan listing course dependency nodes (maximum 2 to 3 nodes). Select node names only from the current course topics supplied in the request. Do not invent existing course nodes. You MUST call the final_result tool immediately to return the study plan. Do not ask for clarification or write plain text.",
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = StudyPlan
else:
    agent_kwargs["result_type"] = StudyPlan

orchestrator_agent = Agent(**agent_kwargs)
