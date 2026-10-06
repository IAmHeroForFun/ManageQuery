import json
from pathlib import Path
from typing import Dict, Any

def get_job_storage_paths(job_id: str, media_root: Path) -> Dict[str, Path]:
    """
    Returns structured directory paths for a specific analysis job.
    """
    base_dir = media_root / 'analysis' / str(job_id)
    raw_dir = base_dir / 'raw'
    processed_dir = base_dir / 'processed'
    outputs_dir = base_dir / 'outputs'

    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    return {
        'base': base_dir,
        'raw': raw_dir,
        'processed': processed_dir,
        'outputs': outputs_dir,
    }

def validate_geojson_polygon(geojson_data: Any) -> bool:
    """
    Validates if data is a valid GeoJSON Polygon or MultiPolygon.
    """
    if isinstance(geojson_data, str):
        try:
            geojson_data = json.loads(geojson_data)
        except Exception:
            return False

    if not isinstance(geojson_data, dict):
        return False

    geom_type = geojson_data.get('type')
    coords = geojson_data.get('coordinates')
    return geom_type in ('Polygon', 'MultiPolygon') and bool(coords)
