import React from "react";
import MapView, { Marker } from "react-native-maps";
import type { Region } from "react-native-maps";

export type LocationMapLocation = {
    id: string;
    latitude: number;
    longitude: number;
    status: string;
    color: string;
};

export type LocationMapProps = {
    userLocation: {
        latitude: number;
        longitude: number;
    };
    locations: LocationMapLocation[];
    selectedLocationId: string | null;
    onLocationSelect: (id: string) => void;
};

export default function LocationMap({
    userLocation,
    locations,
    selectedLocationId,
    onLocationSelect,
}: LocationMapProps) {
    const coordinates = [
        userLocation,
        ...locations.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ];
    const latitudes = coordinates.map(({ latitude }) => latitude);
    const longitudes = coordinates.map(({ longitude }) => longitude);
    const latitudeDelta = Math.max(
        Math.max(...latitudes) - Math.min(...latitudes) + 0.04,
        0.02,
    );
    const longitudeDelta = Math.max(
        Math.max(...longitudes) - Math.min(...longitudes) + 0.04,
        0.02,
    );
    const initialRegion: Region = {
        latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2,
        longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
        latitudeDelta,
        longitudeDelta,
    };

    return (
        <MapView style={{ width: "100%", height: "100%" }} initialRegion={initialRegion}>
            <Marker
                coordinate={userLocation}
                title="Your location"
                pinColor="#1565C0"
            />
            {locations.map((location) => (
                <Marker
                    key={location.id}
                    coordinate={location}
                    title={`Trailer ${location.id}`}
                    description={location.status}
                    pinColor={
                        selectedLocationId === location.id
                            ? "#C62828"
                            : location.color
                    }
                    onPress={() => onLocationSelect(location.id)}
                />
            ))}
        </MapView>
    );
}
