"""
Prompt templates and fallback templates for bilingual Situation Reports.
"""
from typing import Dict, Any

def build_prompt(stats: Dict[str, Any], language: str = "english") -> str:
    lang_instruction = {
        "english": "Write the report in formal English.",
        "nepali": "सम्पूर्ण स्थिति रिपोर्ट औपचारिक नेपाली भाषामा लेख्नुहोस्। (Write the report in formal Nepali language.)"
    }.get(language, "Write the report in formal English.")

    return f"""You are a professional disaster response analyst writing an official situation report for emergency rescue coordinators.

STRICT GROUNDING RULE: Use ONLY the numbers provided below. Do not estimate, extrapolate, or invent any figures.

--- VERIFIED DATA FROM SATELLITE ANALYSIS ---
Event: Flood on {stats['flood_date']} in {stats['area_name']}
Data source: {stats['data_source']}
Analysis completed: {stats['analysis_date']}

FLOOD EXTENT:
- Total inundated and debris area: {stats['flood_area_km2']:.1f} km²

INFRASTRUCTURE DAMAGE:
- Buildings confirmed affected: {stats['buildings_affected']}
- Buildings possibly affected: {stats['buildings_possibly_affected']}
- Roads damaged: {stats['roads_damaged_km']:.1f} km
- Bridges damaged or destroyed: {stats['bridges_damaged']}

ACCESS & ISOLATION:
- Settlements with no road access to nearest hospital: {stats['settlements_cutoff']}
- Names of cut-off settlements: {', '.join(stats['cutoff_settlement_names'])}
--- END DATA ---

{lang_instruction}

Format the report (150–200 words) with these sections:
1. SUMMARY — overview of flood impact using only the data above
2. INFRASTRUCTURE DAMAGE — specific damaged roads, bridges, and building figures
3. POPULATION ACCESS — cut-off settlements, urgency for helicopter/foot access
4. DATA LIMITATIONS — note that Sentinel radar satellites revisit every 12 days; cloud cover may affect optical imagery; this system is an educational prototype and requires ground truth verification

End with attribution:
"Contains modified Copernicus Sentinel data 2026. © OpenStreetMap contributors."
"""

def get_fallback_report(stats: Dict[str, Any], language: str = "english") -> str:
    cutoff_str = ", ".join(stats.get("cutoff_settlement_names", ["Ghatta", "Syaule", "Larcha"]))

    if language == "nepali":
        return f"""स्थिति रिपोर्ट — त्रिशूली बाढी, नेपाल ({stats.get('flood_date', '2026-08-26')})
विश्लेषण मिति: {stats.get('analysis_date', '2026-10-05')} | स्रोत: सेन्टिनेल-१ र सेन्टिनेल-२

१. सारांश
भोटे कोशी–त्रिशूली कोरिडोरको उपग्रह विश्लेषण अनुसार कुल {stats.get('flood_area_km2', 47.3):.1f} वर्ग किलोमिटर क्षेत्र बाढी र मलवाले ढाकिएको छ। हिमनदी विष्फोटनपछि आएको यस बाढीले तटीय क्षेत्रमा व्यापक क्षति पुर्‍याएको छ।

२. पूर्वाधार क्षति
प्राप्त विवरण अनुसार {stats.get('buildings_affected', 312)} भवनहरू प्रत्यक्ष प्रभावित भएका छन् भने {stats.get('buildings_possibly_affected', 89)} भवनहरू आंशिक जोखिममा छन्। {stats.get('roads_damaged_km', 28.4):.1f} किलोमिटर सडक र {stats.get('bridges_damaged', 7)} पुलहरू क्षतिग्रस्त भएका छन्।

३. जनसंख्या पहुँच
{stats.get('settlements_cutoff', 5)} बस्तीहरू (विशेष गरी {cutoff_str}) मुख्य अस्पताल र बजारसँगको सडक सम्पर्कबाट पूर्ण रूपमा विच्छेद भएका छन्। उद्धारका लागि तत्काल वैकल्पिक मार्ग वा हेलिकप्टर आवश्यक छ।

४. डेटाका सीमाहरू
सेन्टिनेल उपग्रहहरू हरेक १२ दिनमा मात्र एउटै कक्षबाट घुम्ने भएकाले तत्कालिन पूर्वसूचना सम्भव छैन। यो प्रणाली शैक्षिक प्रोटोटाइप हो।

Contains modified Copernicus Sentinel data 2026. © OpenStreetMap contributors."""

    return f"""SITUATION REPORT — Trishuli Flood, Nepal ({stats.get('flood_date', '2026-08-26')})
Analysis Date: {stats.get('analysis_date', '2026-10-05')} | Source: Sentinel-1 SAR & Sentinel-2 Optical

1. SUMMARY
Satellite analysis of the Bhote Koshi–Trishuli corridor confirms an estimated total flood and debris extent of {stats.get('flood_area_km2', 47.3):.1f} km² resulting from the glacial lake outburst and debris flow event.

2. INFRASTRUCTURE DAMAGE
Assessment against pre-event OpenStreetMap data indicates {stats.get('buildings_affected', 312)} buildings confirmed affected, with an additional {stats.get('buildings_possibly_affected', 89)} possibly damaged. A total of {stats.get('roads_damaged_km', 28.4):.1f} km of road network and {stats.get('bridges_damaged', 7)} bridges have been severed or structurally compromised.

3. POPULATION ACCESS
A total of {stats.get('settlements_cutoff', 5)} settlements—notably {cutoff_str}—have lost road connectivity to district health facilities in Bidur and Betrawati. Emergency access requires prioritized aerial and foot reconnaissance.

4. DATA LIMITATIONS
Sentinel-1 radar sensors operate on a 12-day repeat orbit; sudden pre-collapse detection is beyond sensor capabilities. This assessment is an educational prototype and must be verified by field disaster teams.

Contains modified Copernicus Sentinel data 2026. © OpenStreetMap contributors."""
