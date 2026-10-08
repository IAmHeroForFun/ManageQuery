"""
Gemini 1.5 Flash bilingual situation report copilot generator.
"""
import os
import logging
from typing import Dict, Any
from django.conf import settings
from .templates import build_prompt, get_fallback_report

logger = logging.getLogger(__name__)

class SituationReportGenerator:
    """
    Generates English and Nepali disaster situation reports using Google Gemini Free Tier.
    Enforces strict data grounding: every number must originate from pipeline statistics.
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')

    def generate(self, stats: Dict[str, Any]) -> Dict[str, str]:
        """
        Produces reports in both English and Nepali.
        Returns: {"english": str, "nepali": str}
        """
        if not self.api_key:
            logger.info("GEMINI_API_KEY is not set. Generating verified grounded template report.")
            return {
                "english": get_fallback_report(stats, language="english"),
                "nepali": get_fallback_report(stats, language="nepali")
            }

        try:
            return self._call_gemini(stats)
        except Exception as e:
            logger.warning("Gemini API call failed (%s). Falling back to grounded report templates.", e)
            return {
                "english": get_fallback_report(stats, language="english"),
                "nepali": get_fallback_report(stats, language="nepali")
            }

    def answer_question(self, stats: Dict[str, Any], question: str) -> str:
        """
        Interactive Q&A Copilot for field rescuers.
        Answers user questions using ONLY satellite facts and measurements.
        """
        from .templates import build_qa_prompt
        prompt = build_qa_prompt(stats, question)

        if not self.api_key:
            # Deterministic zero-hallucination factual answer from snapshot
            q_lower = question.lower()
            if "road" in q_lower or "highway" in q_lower:
                return f"Satellite analysis confirms {stats.get('roads_damaged_km', 0):.1f} km of road network damaged or severed in {stats.get('area_name', 'the area')}."
            elif "building" in q_lower or "house" in q_lower:
                return f"A total of {stats.get('buildings_affected', 0)} buildings are confirmed affected, with {stats.get('buildings_possibly_affected', 0)} possibly damaged."
            elif "bridge" in q_lower:
                return f"{stats.get('bridges_damaged', 0)} bridge(s) have been confirmed damaged or destroyed."
            elif "cut off" in q_lower or "isolated" in q_lower or "hospital" in q_lower:
                names = ", ".join(stats.get('cutoff_settlement_names', []))
                return f"{stats.get('settlements_cutoff', 0)} settlement(s) lost road access to nearest hospital: {names}."
            elif "area" in q_lower or "extent" in q_lower or "km" in q_lower:
                return f"Total satellite-detected inundation and debris extent is {stats.get('flood_area_km2', 0):.1f} km²."
            return f"Verified satellite statistics for {stats.get('area_name')}: {stats.get('flood_area_km2', 0):.1f} km² flood extent, {stats.get('roads_damaged_km', 0):.1f} km roads damaged, {stats.get('buildings_affected', 0)} buildings affected, {stats.get('settlements_cutoff', 0)} cut-off settlements ({', '.join(stats.get('cutoff_settlement_names', []))})."

        # Try modern google-genai SDK first with supported models
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            for m in ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"]:
                try:
                    resp = client.models.generate_content(model=m, contents=prompt)
                    if resp.text:
                        return resp.text
                except Exception:
                    continue
        except Exception:
            pass

        try:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=self.api_key)
            for m in ["gemini-1.5-flash", "gemini-pro"]:
                try:
                    model = genai_legacy.GenerativeModel(m)
                    resp = model.generate_content(prompt)
                    if resp.text:
                        return resp.text
                except Exception:
                    continue
        except Exception as e:
            logger.warning("Gemini Q&A call failed: %s", e)

        return f"Verified data for {stats.get('area_name')}: {stats.get('roads_damaged_km', 0):.1f} km roads damaged, {stats.get('settlements_cutoff', 0)} cut-off villages ({', '.join(stats.get('cutoff_settlement_names', []))})."

    def _call_gemini(self, stats: Dict[str, Any]) -> Dict[str, str]:
        prompt_en = build_prompt(stats, language="english")
        prompt_ne = build_prompt(stats, language="nepali")

        # Try google_genai client first (modern SDK)
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            for m in ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"]:
                try:
                    resp_en = client.models.generate_content(model=m, contents=prompt_en)
                    resp_ne = client.models.generate_content(model=m, contents=prompt_ne)
                    if resp_en.text:
                        return {
                            "english": resp_en.text or get_fallback_report(stats, "english"),
                            "nepali": resp_ne.text or get_fallback_report(stats, "nepali")
                        }
                except Exception as ex:
                    logger.debug("Model %s attempt failed: %s", m, ex)
                    continue
        except ImportError:
            pass

        # Try google.generativeai (legacy SDK)
        try:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=self.api_key)
            for m in ["gemini-1.5-flash", "gemini-pro"]:
                try:
                    model = genai_legacy.GenerativeModel(m)
                    resp_en = model.generate_content(prompt_en)
                    resp_ne = model.generate_content(prompt_ne)
                    if resp_en.text:
                        return {
                            "english": resp_en.text or get_fallback_report(stats, "english"),
                            "nepali": resp_ne.text or get_fallback_report(stats, "nepali")
                        }
                except Exception:
                    continue
        except Exception as e:
            logger.warning("Gemini API call failed (%s). Falling back to grounded report templates.", e)
            raise RuntimeError(f"Both Gemini SDK calls failed: {e}")
