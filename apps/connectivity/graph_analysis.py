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
        # 1. Build intact baseline graph (pre-flood) and post-flood graph
        G_pre = nx.Graph()
        G_post = nx.Graph()

        with open(osm_paths["roads"], "r", encoding="utf-8") as f:
            roads_data = json.load(f)

        severed_road_ids = {
            f["osm_id"] for f in damaged_features if f.get("status") in ("affected", "possibly_affected")
        }

        # Add edges with 45m spatial tolerance snapping to bridge digitized gaps
        def _snap_pt(pt):
            # Snap to ~0.0004 deg (~45 meters) grid
            return (round(round(pt[0] / 0.0004) * 0.0004, 4), round(round(pt[1] / 0.0004) * 0.0004, 4))

        for feature in roads_data.get("features", []):
            road_id = feature["properties"]["osm_id"]
            coords = feature["geometry"]["coordinates"]
            is_severed = road_id in severed_road_ids

            for i in range(len(coords) - 1):
                u = _snap_pt(coords[i])
                v = _snap_pt(coords[i+1])
                if u == v:
                    continue
                dist = ((u[0]-v[0])**2 + (u[1]-v[1])**2)**0.5 * 105.0  # km approx
                G_pre.add_edge(u, v, weight=dist)
                if not is_severed:
                    G_post.add_edge(u, v, weight=dist)

        # 2. Identify all medical facilities / hospitals and candidate community nodes
        with open(osm_paths["settlements"], "r", encoding="utf-8") as f:
            settlements_data = json.load(f)

        settlement_feats = settlements_data.get("features", [])
        if not settlement_feats:
            return []

        # Find all facilities that are marked as hospitals or contain hospital in their name
        hospitals = []
        communities = []
        for feat in settlement_feats:
            p = feat["properties"]
            raw_n = p.get("name", "")
            if p.get("is_hospital") or "hospital" in raw_n.lower() or "medical" in raw_n.lower() or "clinic" in raw_n.lower():
                h_coords = feat["geometry"]["coordinates"]
                h_node = self._find_nearest_node(G_pre, _snap_pt(h_coords))
                hospitals.append({
                    "name": raw_n if ("Hospital" in raw_n or "Medical" in raw_n or "Clinic" in raw_n) else f"{raw_n} District Hospital",
                    "coords": h_coords,
                    "node": h_node,
                    "feat": feat
                })
            else:
                communities.append(feat)

        # Fallback: if no dedicated hospital tag found, designate the first settlement as primary hospital
        if not hospitals:
            first_f = settlement_feats[0]
            first_coords = first_f["geometry"]["coordinates"]
            first_node = self._find_nearest_node(G_pre, _snap_pt(first_coords))
            raw_n = first_f["properties"]["name"]
            hospitals.append({
                "name": f"{raw_n} Emergency Center",
                "coords": first_coords,
                "node": first_node,
                "feat": first_f
            })
            communities = settlement_feats[1:]

        results = []

        # For every community settlement, evaluate accessibility and exact physical cause
        for feature in communities:
            name = feature["properties"]["name"]
            coords = feature["geometry"]["coordinates"]
            settlement_pt = _snap_pt(coords)
            s_node = self._find_nearest_node(G_pre, settlement_pt)

            dist_to_road = (
                (((s_node[0]-settlement_pt[0])**2 + (s_node[1]-settlement_pt[1])**2)**0.5 * 105.0)
                if s_node else 999.0
            )

            best_hospital = None
            best_dist = 999.0
            is_connected_post = False
            was_connected_pre = False

            # Check post-flood reachability across intact edges
            for hosp in hospitals:
                h_node = hosp["node"]
                if (
                    s_node and h_node and dist_to_road <= 3.5 and
                    G_post.has_node(s_node) and G_post.has_node(h_node) and
                    nx.has_path(G_post, s_node, h_node)
                ):
                    path_len = round(nx.shortest_path_length(G_post, s_node, h_node, weight='weight'), 1)
                    if path_len < best_dist:
                        best_dist = path_len
                        best_hospital = hosp
                        is_connected_post = True

            # Check pre-flood reachability to determine IF flood was the cause of disconnection
            for hosp in hospitals:
                h_node = hosp["node"]
                if (
                    s_node and h_node and dist_to_road <= 3.5 and
                    G_pre.has_node(s_node) and G_pre.has_node(h_node) and
                    nx.has_path(G_pre, s_node, h_node)
                ):
                    was_connected_pre = True
                    if not best_hospital:
                        path_len = round(nx.shortest_path_length(G_pre, s_node, h_node, weight='weight'), 1)
                        best_dist = path_len
                        best_hospital = hosp

            # Determine straight-line geographically closest hospital if disconnected
            if not best_hospital:
                closest_hosp = min(
                    hospitals,
                    key=lambda h: ((settlement_pt[0]-h["coords"][0])**2 + (settlement_pt[1]-h["coords"][1])**2)
                )
                best_hospital = closest_hosp
                best_dist = round(((settlement_pt[0]-closest_hosp["coords"][0])**2 + (settlement_pt[1]-closest_hosp["coords"][1])**2)**0.5 * 105.0, 1)

            # Categorize physical root cause of isolation
            if is_connected_post:
                isolation_reason = "accessible"
            elif was_connected_pre and not is_connected_post:
                # Path existed pre-flood, but was severed by the flood polygon downstream
                isolation_reason = "corridor_breached"
            elif dist_to_road > 2.5:
                isolation_reason = "remote_mountain"
            else:
                isolation_reason = "road_network_gap"

            results.append({
                "name": name,
                "is_cutoff": not is_connected_post,
                "isolation_reason": isolation_reason,
                "nearest_hospital": best_hospital["name"],
                "nearest_hospital_geojson": json.dumps({"type": "Point", "coordinates": best_hospital["coords"]}),
                "pre_flood_distance_km": best_dist,
                "population_estimate": feature["properties"].get("population", 500),
                "geometry_geojson": json.dumps(feature["geometry"])
            })

        with open(output_dir / "cutoff_settlements.json", "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        isolated_count = sum(1 for r in results if r["is_cutoff"])
        logger.info("Connectivity analysis complete: %d / %d communities cut off across %d hospital facilities.", isolated_count, len(results), len(hospitals))
        return results

    def _find_nearest_node(self, G: nx.Graph, point: tuple) -> Any:
        if not G.nodes:
            return None
        return min(G.nodes, key=lambda n: (n[0]-point[0])**2 + (n[1]-point[1])**2)
