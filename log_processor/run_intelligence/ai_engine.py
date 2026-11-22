"""
log_processor/run_intelligence/ai_engine.py
══════════════════════════════════════════════════════════════════════════════
6-dimension AI Recommendation Engine for the Run Intelligence Engine.

Uses prompts from log_processor/prompts.py (same pattern as ClusterDNA).
Supports Gemini, Anthropic, and OpenAI via config/settings.py.
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_rie_ai_recommendations(
    summary: dict,
    optimization_priorities: list[str] | None = None,
    workload_type: str = "Auto-detect",
    data_volume: str = "Unknown",
) -> dict[str, Any]:
    """
    Generate 6-dimension AI recommendations from a RunIntelligenceSummary.
    Reads LLM provider and API key from config/settings.py.
    Uses system prompt + skills from log_processor/prompts.py.
    Falls back gracefully if the AI engine is not configured.
    """
    from config.run_intelligence_settings import RIE_AI_ENABLED
    from config.settings import LLM_PROVIDER, llm_is_configured

    if not RIE_AI_ENABLED:
        return {
            "summary": "AI analysis is disabled (RIE_AI_ENABLED=false).",
            "recommendations": [],
            "_offline": True,
        }

    if not llm_is_configured():
        return {
            "summary": "AI engine is offline — no LLM API key configured.",
            "recommendations": [],
            "_offline": True,
        }

    # Import prompts from central prompts.py (same pattern as ClusterDNA)
    from log_processor.prompts import RIE_SYSTEM_PROMPT, build_rie_user_prompt
    user_prompt = build_rie_user_prompt(
        summary, 
        optimization_priorities,
        workload_type,
        data_volume
    )

    try:
        if LLM_PROVIDER == "gemini":
            return _call_gemini(RIE_SYSTEM_PROMPT, user_prompt)
        elif LLM_PROVIDER == "anthropic":
            return _call_anthropic(RIE_SYSTEM_PROMPT, user_prompt)
        elif LLM_PROVIDER == "openai":
            return _call_openai(RIE_SYSTEM_PROMPT, user_prompt)
        else:
            return {
                "summary": f"Unknown LLM provider: {LLM_PROVIDER}",
                "recommendations": [],
                "_offline": True,
            }
    except Exception as e:
        logger.error(f"[rie_ai_engine] Unexpected error: {e}")
        return {
            "summary": "An unexpected error occurred during AI analysis.",
            "recommendations": [],
            "_error": str(e),
        }


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from an LLM response, robust to surrounding text."""
    text = text.strip()
    start = text.find("{")
    end   = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError as e:
            logger.warning(f"[rie_ai_engine] JSON parse error: {e}")
            return {"summary": f"JSON parse error: {e}", "recommendations": [], "_error": str(e)}
    return {"summary": "No JSON found in AI response.", "recommendations": []}


def _call_gemini(system_prompt: str, user_prompt: str) -> dict:
    from config.settings import GEMINI_API_KEY, GEMINI_MODEL
    import time
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)
        # Combine system + user since Gemini uses single contents field
        combined = f"{system_prompt}\n\n{user_prompt}"
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=combined,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                        max_output_tokens=4096,
                    ),
                )
                if response and response.text:
                    return _parse_json_response(response.text)
                return {"summary": "Empty response from Gemini.", "recommendations": []}
            except Exception as e:
                err_str = str(e)
                is_quota = "429" in err_str or "quota" in err_str.lower() or "resource_exhausted" in err_str.lower()
                is_daily = "PerDay" in err_str or "per_day" in err_str.lower()

                if is_quota:
                    # Extract retry delay from Gemini's error message dynamically
                    import re
                    from datetime import datetime, timezone, timedelta

                    retry_seconds = None
                    match = re.search(r"retry in\s+([\d.]+)s", err_str, re.IGNORECASE)
                    if match:
                        retry_seconds = float(match.group(1))

                    # Calculate real time until midnight UTC (daily quota reset)
                    now_utc = datetime.now(timezone.utc)
                    midnight_utc = (now_utc + timedelta(days=1)).replace(
                        hour=0, minute=0, second=0, microsecond=0
                    )
                    time_until_reset = midnight_utc - now_utc
                    hours, remainder = divmod(int(time_until_reset.total_seconds()), 3600)
                    minutes = remainder // 60

                    if is_daily:
                        # Daily quota is exhausted — retrying will never help, fail fast
                        reset_msg = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
                        retry_msg = (
                            f" Gemini suggests retrying in {retry_seconds:.0f}s."
                            if retry_seconds and not is_daily
                            else ""
                        )
                        return {
                            "summary": (
                                f"⚠️ Gemini daily quota exhausted. "
                                f"The free-tier daily allowance for model '{GEMINI_MODEL}' has been fully used. "
                                f"Quota resets at midnight UTC — approximately {reset_msg} from now.{retry_msg} "
                                f"Your run data was fetched and is displayed above. "
                                f"To avoid this, upgrade to the Gemini pay-as-you-go tier or switch the LLM provider in config/settings.py."
                            ),
                            "recommendations": [],
                            "_quota_exhausted": True,
                            "_retry_after_seconds": retry_seconds,
                            "_quota_resets_in": f"{reset_msg}",
                        }
                    elif attempt < max_retries - 1:
                        # Per-minute rate limit — brief retry makes sense
                        sleep_time = int(retry_seconds) + 2 if retry_seconds else (attempt + 1) * 15
                        logger.warning(f"Gemini rate limit hit. Retrying in {sleep_time}s... (Attempt {attempt+1}/{max_retries})")
                        time.sleep(sleep_time)
                        continue
                raise e

    except ImportError:
        return {"summary": "google-genai not installed.", "recommendations": [],
                "_error": "pip install google-genai"}
    except Exception as e:
        logger.error(f"[rie_ai_engine] Gemini error: {e}")
        return {"summary": f"Gemini error: {e}", "recommendations": [], "_error": str(e)}


def _call_anthropic(system_prompt: str, user_prompt: str) -> dict:
    from config.settings import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=8192,
            temperature=0.2,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = msg.content[0].text if msg.content else ""
        return _parse_json_response(text)
    except ImportError:
        return {"summary": "anthropic not installed.", "recommendations": [],
                "_error": "pip install anthropic"}
    except Exception as e:
        logger.error(f"[rie_ai_engine] Anthropic error: {e}")
        return {"summary": f"Anthropic error: {e}", "recommendations": [], "_error": str(e)}


def _call_openai(system_prompt: str, user_prompt: str) -> dict:
    from config.settings import OPENAI_API_KEY, OPENAI_MODEL
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=8192,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
        )
        text = resp.choices[0].message.content or ""
        return _parse_json_response(text)
    except ImportError:
        return {"summary": "openai not installed.", "recommendations": [],
                "_error": "pip install openai"}
    except Exception as e:
        logger.error(f"[rie_ai_engine] OpenAI error: {e}")
        return {"summary": f"OpenAI error: {e}", "recommendations": [], "_error": str(e)}
