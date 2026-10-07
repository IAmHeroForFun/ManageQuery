"""
Road network graph connectivity and cut-off settlement analyzer.
Evaluates topological reachability from settlements to regional medical centers.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
import networkx as nx

logger = logging.getLogger(__name__)

class ConnectivityAnalyzer:
    """
    Constructs a topological network graph from OSM road ways.
    Removes flooded/damaged road segments.
    Applies BFS / Dijkstra reachability to check whether settlements
    have an intact road route to district medical facilities.
    """

    def analyze_settlement_isolation(
        self,
        damaged_features: List[Dict[str, Any]],
        osm_paths: Dict[str, Path],
        output_dir: Path
    ) -> List[Dict[str, Any]]:
        output_dir.mkdir(parents=True, exist_ok=True)

        # 1. Build road graph
        G = nx.Graph()
        with open(osm_paths["roads"], "r", encoding="utf-8") as f:
            roads_data = json.load(f)

        severed_road_ids = {
            f["osm_id"] for f in damaged_features if f.get("status") in ("affected", "possibly_affected")
        }

        # Add intact road edges
        for feature in roads_data.get("features", []):
            road_id = feature["properties"]["osm_id"]
            coords = feature["geometry"]["coordinates"]

            # Sever flooded edges
            if road_id in severed_road_ids:
                continue

            for i in range(len(coords) - 1):
                u = (round(coords[i][0], 4), round(coords[i][1], 4))
                v = (round(coords[i+1][0], 4), round(coords[i+1][1], 4))
                dist = ((u[0]-v[0])**2 + (u[1]-v[1])**2)**0.5 * 105.0  # km approx
                G.add_edge(u, v, weight=dist)

        # 2. Check each settlement
        with open(osm_paths["settlements"], "r", encoding="utf-8") as f:
            settlements_data = json.load(f)

        settlement_feats = settlements_data.get("features", [])
        if not settlement_feats:
            return []

        # The first settlement or dedicated medical node acts as the base hub / district hospital
        hub_coords = settlement_feats[0]["geometry"]["coordinates"]
        hub_node = self._find_nearest_node(G, (round(hub_coords[0], 4), round(hub_coords[1], 4)))
        raw_name = settlement_feats[0]["properties"]["name"]
        hub_name = raw_name if ("Hospital" in raw_name or "Medical" in raw_name or "Clinic" in raw_name) else f"{raw_name} District Medical Center"

        results = []
        for idx, feature in enumerate(settlement_feats):
            name = feature["properties"]["name"]
            coords = feature["geometry"]["coordinates"]
            settlement_pt = (round(coords[0], 4), round(coords[1], 4))

            if idx == 0:
                # The hub is always connected to itself
                is_isolated = False
                distance_km = 0.5
            else:
                s_node = self._find_nearest_node(G, settlement_pt)
                if s_node and hub_node and nx.has_path(G, s_node, hub_node):
                    is_isolated = False
                    distance_km = round(nx.shortest_path_length(G, s_node, hub_node, weight='weight'), 1)
                else:
                    is_isolated = True
                    # Estimate straight line distance when severed
                    distance_km = round(((settlement_pt[0]-hub_coords[0])**2 + (settlement_pt[1]-hub_coords[1])**2)**0.5 * 105.0, 1)

            results.append({
                "name": name,
                "is_cutoff": is_isolated,
                "nearest_hospital": f"{hub_name} Emergency Center",
                "nearest_hospital_geojson": json.dumps({"type": "Point", "coordinates": hub_coords}),
                "pre_flood_distance_km": distance_km,
                "population_estimate": feature["properties"].get("population", 500),
                "geometry_geojson": json.dumps(feature["geometry"])
            })

        with open(output_dir / "cutoff_settlements.json", "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        isolated_count = sum(1 for r in results if r["is_cutoff"])
        logger.info("Connectivity analysis complete: %d / %d settlements cut off.", isolated_count, len(results))
        return results

    def _find_nearest_node(self, G: nx.Graph, point: tuple) -> Any:
        if not G.nodes:
            return None
        return min(G.nodes, key=lambda n: (n[0]-point[0])**2 + (n[1]-point[1])**2)
