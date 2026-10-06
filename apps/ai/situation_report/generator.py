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

    def _call_gemini(self, stats: Dict[str, Any]) -> Dict[str, str]:
        prompt_en = build_prompt(stats, language="english")
        prompt_ne = build_prompt(stats, language="nepali")

        # Try google_genai client first (modern SDK)
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            resp_en = client.models.generate_content(model="gemini-2.5-flash", contents=prompt_en)
            resp_ne = client.models.generate_content(model="gemini-2.5-flash", contents=prompt_ne)
            return {
                "english": resp_en.text or get_fallback_report(stats, "english"),
                "nepali": resp_ne.text or get_fallback_report(stats, "nepali")
            }
        except ImportError:
            pass

        # Try google.generativeai (legacy SDK)
        try:
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=self.api_key)
            model = genai_legacy.GenerativeModel("gemini-1.5-flash")
            resp_en = model.generate_content(prompt_en)
            resp_ne = model.generate_content(prompt_ne)
            return {
                "english": resp_en.text or get_fallback_report(stats, "english"),
                "nepali": resp_ne.text or get_fallback_report(stats, "nepali")
            }
        except Exception as e:
            raise RuntimeError(f"Both Gemini SDK calls failed: {e}")
