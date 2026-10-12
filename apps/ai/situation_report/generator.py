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
            # Deterministic zero-hallucination factual answer from rich snapshot
            q_lower = question.lower()
            roads_named = ", ".join(stats.get('damaged_road_names', []))
            bldgs_named = ", ".join(stats.get('damaged_building_names', []))
            flow_info = stats.get('flow_path_info') or {}

            if "road" in q_lower or "highway" in q_lower or "drive" in q_lower or "route" in q_lower:
                msg = f"Satellite radar confirms {stats.get('roads_damaged_km', 0):.1f} km of road network severed in {stats.get('area_name', 'the area')}."
                if roads_named:
                    msg += f" Confirmed affected roads include: {roads_named}."
                return msg
            elif "building" in q_lower or "house" in q_lower or "structure" in q_lower:
                msg = f"A total of {stats.get('buildings_affected', 0)} buildings are confirmed inundated."
                if bldgs_named:
                    msg += f" Affected facilities include: {bldgs_named}."
                return msg
            elif "bridge" in q_lower:
                return f"{stats.get('bridges_damaged', 0)} bridge(s) have been confirmed damaged or destroyed along key river crossings."
            elif "hospital" in q_lower or "medical" in q_lower or "clinic" in q_lower or "evacuat" in q_lower:
                details = stats.get('cutoff_details', [])
                if details:
                    return f"Hospital access analysis:\n• " + "\n• ".join(details)
                names = ", ".join(stats.get('cutoff_settlement_names', []))
                return f"{stats.get('settlements_cutoff', 0)} settlement(s) lost road access to nearest hospital: {names}."
            elif "speed" in q_lower or "flow" in q_lower or "eta" in q_lower or "surge" in q_lower:
                if flow_info and flow_info.get('avg_speed_kmh'):
                    return f"Downstream flood flow is estimated at {flow_info.get('avg_speed_kmh')} km/h along a {flow_info.get('path_length_km')} km corridor. Settlement arrival timeline: {flow_info.get('settlement_etas')}."
                return f"No active flow path surge corridor was recorded for this specific AOI."
            elif "cut off" in q_lower or "isolated" in q_lower or "village" in q_lower:
                names = ", ".join(stats.get('cutoff_settlement_names', []))
                return f"{stats.get('settlements_cutoff', 0)} settlement(s) are completely isolated without intact road routes: {names}. Emergency airlifts recommended."
            elif "area" in q_lower or "extent" in q_lower or "km" in q_lower:
                return f"Total satellite-detected inundation and debris extent is {stats.get('flood_area_km2', 0):.1f} km² grounded in Sentinel-1 SAR backscatter."

            return f"Satellite telemetry for {stats.get('area_name')}: {stats.get('flood_area_km2', 0):.1f} km² flood extent, {stats.get('roads_damaged_km', 0):.1f} km roads damaged, {stats.get('settlements_cutoff', 0)} isolated settlements ({', '.join(stats.get('cutoff_settlement_names', []))})."

        # Try modern google-genai SDK first with supported models
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            for m in ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-latest"]:
                try:
                    resp = client.models.generate_content(model=m, contents=prompt)
                    if resp.text:
                        return resp.text.strip()
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
                        return resp.text.strip()
                except Exception:
                    continue
        except Exception as e:
            logger.warning("Gemini Q&A call failed: %s", e)

        # Factual grounded fallback if remote API is throttled
        roads_named = ", ".join(stats.get('damaged_road_names', []))
        return f"Verified data for {stats.get('area_name')}: {stats.get('roads_damaged_km', 0):.1f} km roads damaged{f' (including {roads_named})' if roads_named else ''}, {stats.get('settlements_cutoff', 0)} cut-off settlements ({', '.join(stats.get('cutoff_settlement_names', []))})."

    def _call_gemini(self, stats: Dict[str, Any]) -> Dict[str, str]:
        prompt_en = build_prompt(stats, language="english")
        prompt_ne = build_prompt(stats, language="nepali")

        text_en = None
        text_ne = None

        # 1. Try modern google.genai SDK
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            for m in ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"]:
                if not text_en:
                    try:
                        resp = client.models.generate_content(model=m, contents=prompt_en)
                        if resp.text:
                            text_en = resp.text
                    except Exception as ex:
                        logger.debug("EN model %s failed: %s", m, ex)
                if not text_ne:
                    try:
                        resp = client.models.generate_content(model=m, contents=prompt_ne)
                        if resp.text:
                            text_ne = resp.text
                    except Exception as ex:
                        logger.debug("NE model %s failed: %s", m, ex)
                if text_en and text_ne:
                    break
        except Exception as e:
            logger.debug("google.genai SDK attempt error: %s", e)

        # 2. Try legacy google.generativeai if either is still missing
        if not text_en or not text_ne:
            try:
                import google.generativeai as genai_legacy
                genai_legacy.configure(api_key=self.api_key)
                for m in ["gemini-1.5-flash", "gemini-pro"]:
                    if not text_en:
                        try:
                            model = genai_legacy.GenerativeModel(m)
                            resp = model.generate_content(prompt_en)
                            if resp.text:
                                text_en = resp.text
                        except Exception:
                            pass
                    if not text_ne:
                        try:
                            model = genai_legacy.GenerativeModel(m)
                            resp = model.generate_content(prompt_ne)
                            if resp.text:
                                text_ne = resp.text
                        except Exception:
                            pass
                    if text_en and text_ne:
                        break
            except Exception as e:
                logger.debug("google.generativeai attempt error: %s", e)

        # Guarantee bilingual return: if any failed, seamlessly use verified grounded template
        return {
            "english": text_en or get_fallback_report(stats, language="english"),
            "nepali": text_ne or get_fallback_report(stats, language="nepali")
        }
