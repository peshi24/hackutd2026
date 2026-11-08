import React, { useEffect, useMemo } from "react";
import { MapContainer, CircleMarker, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

import type { LocationMapProps } from "./LocationMap";

function FitMapBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
    const map = useMap();

    useEffect(() => {
        map.fitBounds(bounds, { padding: [24, 24] });
    }, [bounds, map]);

    return null;
}

export default function LocationMap({
    userLocation,
    locations,
    selectedLocationId,
    onLocationSelect,
}: LocationMapProps) {
    const bounds = useMemo<LatLngBoundsExpression>(
        () => [
            [userLocation.latitude, userLocation.longitude],
            ...locations.map(({ latitude, longitude }) => [latitude, longitude] as [number, number]),
        ],
        [locations, userLocation.latitude, userLocation.longitude],
    );

    return (
        <MapContainer
            center={[userLocation.latitude, userLocation.longitude]}
            zoom={12}
            scrollWheelZoom
            style={{ width: "100%", height: "100%" }}
        >
            <FitMapBounds bounds={bounds} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
                center={[userLocation.latitude, userLocation.longitude]}
                radius={8}
                pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: "#1565C0", fillOpacity: 1 }}
            >
                <Popup>Your location</Popup>
            </CircleMarker>
            {locations.map((location) => (
                <CircleMarker
                    key={location.id}
                    center={[location.latitude, location.longitude]}
                    radius={selectedLocationId === location.id ? 11 : 8}
                    pathOptions={{
                        color: "#FFFFFF",
                        weight: 2,
                        fillColor: selectedLocationId === location.id ? "#C62828" : location.color,
                        fillOpacity: 1,
                    }}
                    eventHandlers={{
                        click: () => onLocationSelect(location.id),
                    }}
                >
                    <Popup>
                        <strong>Trailer {location.id}</strong>
                        <br />
                        {location.status}
                        <br />
                        <button type="button" onClick={() => onLocationSelect(location.id)}>
                            Select location
                        </button>
                    </Popup>
                </CircleMarker>
            ))}
        </MapContainer>
    );
}
