import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; name: string; lat: number; lng: number };

function Frame({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.map((p) => [p.lat, p.lng]) as [number, number][];
    if (points.length === 1) map.setView(bounds[0]!, 9);
    else map.fitBounds(bounds, { padding: [48, 48] });
  }, [map, points]);
  return null;
}

export default function JourneyMap({ points }: { points: MapPoint[] }) {
  if (!points.length) return null;
  const line = points.map((p) => [p.lat, p.lng]) as [number, number][];

  return (
    <MapContainer
      center={[line[0]![0], line[0]![1]]}
      zoom={5}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      touchZoom={false}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full bg-transparent"
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
      />
      {points.length > 1 && (
        <Polyline
          positions={line}
          pathOptions={{ color: "#8a8175", weight: 1.25, dashArray: "5, 8", opacity: 0.9 }}
        />
      )}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={4}
          pathOptions={{ color: "#1c1917", weight: 1.25, fillColor: "#1c1917", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
      <Frame points={points} />
    </MapContainer>
  );
}
