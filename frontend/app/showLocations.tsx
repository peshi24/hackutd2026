
import React, { useCallback, useEffect, useState } from "react";

import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Dimensions,
    Linking,
    Platform,
} from "react-native";

import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";

// Get screen dimensions
const { height } = Dimensions.get("window");

// Trailer data format
type Trailer = {
    id: string;
    latitude: number;
    longitude: number;
    capacity: number;
    filled: number;
};

// Add distance to each trailer
type TrailerWithDistance = Trailer & {
    distance: number;
    available: number;
    status: string;
};

export type LocationSelection = {
    trailerName: string;
    distanceMiles: number;
    canTravel: boolean;
    address: string;
    latitude: number;
    longitude: number;
};

type ShowLocationsProps = {
    onSelectionComplete: (selection: LocationSelection) => void;
};

// Example data - replace with your backend API response
const trailerData: Trailer[] = [
    {
        id: "1",
        latitude: 32.9857,
        longitude: -96.7501,
        capacity: 100,
        filled: 35,
    },
    {
        id: "2",
        latitude: 32.9750,
        longitude: -96.7200,
        capacity: 100,
        filled: 85,
    },
    {
        id: "3",
        latitude: 32.9600,
        longitude: -96.7400,
        capacity: 100,
        filled: 20,
    },
    {
        id: "4",
        latitude: 32.9900,
        longitude: -96.7000,
        capacity: 100,
        filled: 100,
    },
    {
        id: "5",
        latitude: 32.9400,
        longitude: -96.7100,
        capacity: 100,
        filled: 60,
    },
    {
        id: "6",
        latitude: 32.9200,
        longitude: -96.7300,
        capacity: 100,
        filled: 40,
    },
];

// Calculate distance using the Haversine formula, in miles.
const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
) => {
    const toRadians = (degrees: number) => degrees * (Math.PI / 180);
    const earthRadiusMiles = 3958.8;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return earthRadiusMiles * c;
};

const getStatus = (available: number, capacity: number) => {
    if (available === 0) return "Full";

    const percentage = available / capacity;
    if (percentage <= 0.2) return "Limited";
    if (percentage <= 0.5) return "Moderate";
    return "Available";
};

export default function ShowLocations({
    onSelectionComplete,
}: ShowLocationsProps) {

    // User's current coordinates
    const [userLocation, setUserLocation] =
        useState<Location.LocationObjectCoords | null>(null);

    // List of nearby trailers
    const [nearbyTrailers, setNearbyTrailers] =
        useState<TrailerWithDistance[]>([]);

    // Selected trailer
    const [selectedTrailer, setSelectedTrailer] =
        useState<string | null>(null);

    // Loading state
    const [loading, setLoading] = useState(true);

    const getUserLocation = useCallback(async () => {
        try {
            // Request location permissions
            const { status } =
                await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
                Alert.alert(
                    "Location Permission",
                    "Please enable location permissions to find nearby trailers."
                );
                setLoading(false);
                return;
            }

            // Get current location
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            setUserLocation(location.coords);

            // Calculate distance from user to each trailer
            const sortedTrailers = trailerData.map((trailer) => {
                const distance = calculateDistance(
                    location.coords.latitude,
                    location.coords.longitude,
                    trailer.latitude,
                    trailer.longitude
                );

                const available = Math.max(
                    0,
                    trailer.capacity - trailer.filled
                );

                return {
                    ...trailer,
                    distance,
                    available,
                    status: getStatus(available, trailer.capacity),
                };
            }).sort((a, b) => a.distance - b.distance);

            // Keep all trailers for map markers,
            // but only show the closest 5 in the cards.
            setNearbyTrailers(sortedTrailers);
        } catch (error) {
            console.error("Error getting location:", error);

            Alert.alert(
                "Location Error",
                "Unable to retrieve your current location."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    // Get user's current location
    useEffect(() => {
        void Promise.resolve().then(getUserLocation);
    }, [getUserLocation]);

    // Status colors
    const getStatusColor = (status: string) => {

        switch (status) {
            case "Available":
                return "#2E8B57";

            case "Moderate":
                return "#D99A24";

            case "Limited":
                return "#E47736";

            case "Full":
                return "#C94C4C";

            default:
                return "#808080";
        }
    };

    // Select a trailer
    const handleSelect = (id: string) => {
        setSelectedTrailer(id);
    };

    const handleLocationAnswer = async (
        trailer: TrailerWithDistance,
        canTravel: boolean
    ) => {
        let address = `Coordinates: ${trailer.latitude.toFixed(5)}, ${trailer.longitude.toFixed(5)}`;

        try {
            const [geocodedAddress] = await Location.reverseGeocodeAsync({
                latitude: trailer.latitude,
                longitude: trailer.longitude,
            });

            if (geocodedAddress) {
                const street = [
                    geocodedAddress.streetNumber,
                    geocodedAddress.street,
                ].filter(Boolean).join(" ");

                const addressParts = [
                    street || geocodedAddress.name,
                    geocodedAddress.city,
                    geocodedAddress.region,
                    geocodedAddress.postalCode,
                    geocodedAddress.country,
                ].filter(Boolean);

                if (addressParts.length > 0) {
                    address = addressParts.join(", ");
                }
            }
        } catch (error) {
            console.error("Unable to find the selected location address:", error);
            if (canTravel) {
                Alert.alert(
                    "Address Lookup",
                    "We couldn't retrieve a street address. Maps will open at the selected location."
                );
            }
        }

        onSelectionComplete({
            trailerName: `Trailer ${trailer.id}`,
            distanceMiles: trailer.distance,
            canTravel,
            address,
            latitude: trailer.latitude,
            longitude: trailer.longitude,
        });

        if (!canTravel) return;

        const coordinates = `${trailer.latitude},${trailer.longitude}`;
        const mapsUrl = Platform.OS === "ios"
            ? `https://maps.apple.com/?ll=${coordinates}&q=${encodeURIComponent(address)}`
            : Platform.OS === "android"
                ? `geo:${coordinates}?q=${coordinates}(${encodeURIComponent(address)})`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} (${coordinates})`)}`;

        try {
            await Linking.openURL(mapsUrl);
        } catch (error) {
            console.error("Unable to open maps for the selected location:", error);
            Alert.alert(
                "Unable to Open Maps",
                "The location is shown in chat, but no maps application could be opened."
            );
        }
    };

    // Submit selected trailer
    const handleSubmit = () => {

        if (!selectedTrailer) {
            Alert.alert(
                "Select a Location",
                "Please select a trailer before continuing."
            );
            return;
        }

        const trailer = nearbyTrailers.find(
            (item) => item.id === selectedTrailer
        );

        if (!trailer) return;

        const trailerName = `Trailer ${trailer.id}`;

        // Ask if user can reach the selected trailer
        Alert.alert(
            "Can You Get There?",
            `You selected ${trailerName}, approximately ${trailer.distance.toFixed(1)} miles away. Are you able to get there by yourself?`,
            [
                {
                    text: "Yes",
                    onPress: () => {
                        void handleLocationAnswer(trailer, true);
                    },
                },
                {
                    text: "No, I need help",
                    onPress: () => {
                        void handleLocationAnswer(trailer, false);
                    },
                },
            ]
        );
    };

    // Loading screen
    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#C62828" />
                <Text style={styles.loadingText}>
                    Finding nearby trailers...
                </Text>
            </View>
        );
    }

    // No location permission / unavailable location
    if (!userLocation) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.text}>
                    We need your location to find nearby trailers.
                </Text>

                <TouchableOpacity
                    style={styles.submitButton}
                    onPress={getUserLocation}
                >
                    <Text style={styles.submitText}>
                        Try Again
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>

            {/* Heading */}
            <View style={styles.header}>
                <Text style={styles.heading}>
                    Based on where you are, here are the nearest Statefarm trailers.
                </Text>

                <Text style={styles.subheading}>
                    Select a location that works best for you.
                </Text>
            </View>

            {/* Map showing ALL trailer locations */}
            <View style={styles.mapContainer}>

                <MapView
                    style={styles.map}
                    initialRegion={{
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude,
                        latitudeDelta: 0.08,
                        longitudeDelta: 0.08,
                    }}
                    showsUserLocation
                    showsMyLocationButton
                >

                    {/* User marker is provided by showsUserLocation */}
                    {nearbyTrailers.map((trailer) => (

                        <Marker
                            key={trailer.id}
                            coordinate={{
                                latitude: trailer.latitude,
                                longitude: trailer.longitude,
                            }}
                            title={`Trailer ${trailer.id}`}
                            description={`${trailer.available} spaces available`}
                            pinColor={
                                selectedTrailer === trailer.id
                                    ? "#3978B8"
                                    : "#C62828"
                            }
                            onPress={() => handleSelect(trailer.id)}
                        />

                    ))}

                </MapView>

            </View>

            {/* Location cards section */}
            <View style={styles.locationsSection}>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        Nearby Locations
                    </Text>

                    <Text style={styles.sectionSubtitle}>
                        Closest to furthest
                    </Text>
                </View>

                {/* Horizontal swipeable cards */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardScroll}
                >

                    {nearbyTrailers.slice(0, 5).map((trailer) => (

                        <TouchableOpacity
                            key={trailer.id}
                            activeOpacity={0.8}
                            style={[
                                styles.locationCard,
                                selectedTrailer === trailer.id &&
                                    styles.selectedCard,
                            ]}
                            onPress={() => handleSelect(trailer.id)}
                        >

                            {/* Trailer name and availability */}
                            <View style={styles.cardTop}>
                                <View style={styles.titleStatus}>
                                    <Text style={styles.cardTitle}>
                                        Trailer {trailer.id}
                                    </Text>

                                    <View style={[
                                        styles.statusBadge,
                                        {
                                            backgroundColor:
                                                getStatusColor(trailer.status) + "20",
                                        },
                                    ]}>
                                        <View style={[
                                            styles.statusDot,
                                            {
                                                backgroundColor:
                                                    getStatusColor(trailer.status),
                                            },
                                        ]} />
                                        <Text style={[
                                            styles.statusText,
                                            {
                                                color:
                                                    getStatusColor(trailer.status),
                                            },
                                        ]}>
                                            {trailer.status}
                                        </Text>
                                    </View>
                                </View>

                                {/* Radio selection indicator */}
                                <View style={styles.radioOuter}>
                                    {selectedTrailer === trailer.id && (
                                        <View style={styles.radioInner} />
                                    )}
                                </View>

                            </View>

                            {/* Distance */}
                            <Text style={styles.distance}>
                                {trailer.distance.toFixed(1)} miles away
                            </Text>

                            {/* Available capacity */}
                            <Text style={styles.capacityText}>
                                {trailer.available} / {trailer.capacity} spaces available
                            </Text>

                            {/* Selection label */}
                            <Text style={styles.selectLabel}>
                                {selectedTrailer === trailer.id
                                    ? "Selected"
                                    : "Tap to select"}
                            </Text>

                        </TouchableOpacity>

                    ))}

                </ScrollView>

            </View>

            {/* Submit button */}
            <View style={styles.footer}>

                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        !selectedTrailer && styles.disabledButton,
                    ]}
                    onPress={handleSubmit}
                    disabled={!selectedTrailer}
                >
                    <Text style={styles.submitText}>
                        Confirm Location
                    </Text>
                </TouchableOpacity>

            </View>

        </View>
    );
}


// Styles
const styles = StyleSheet.create({

    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },

    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "white",
        padding: 24,
    },

    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: "#555",
    },

    header: {
        paddingHorizontal: 20,
        paddingTop: 55,
        paddingBottom: 15,
    },

    heading: {
        fontSize: 23,
        fontWeight: "700",
        color: "#252525",
        lineHeight: 30,
    },

    subheading: {
        fontSize: 14,
        color: "#777",
        marginTop: 8,
    },

    mapContainer: {
        height: height * 0.42,
        marginHorizontal: 16,
        borderRadius: 18,
        overflow: "hidden",
    },

    map: {
        width: "100%",
        height: "100%",
    },

    locationsSection: {
        marginTop: 20,
    },

    sectionHeader: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },

    sectionTitle: {
        fontSize: 19,
        fontWeight: "700",
        color: "#252525",
    },

    sectionSubtitle: {
        fontSize: 12,
        color: "#888",
        marginTop: 4,
    },

    cardScroll: {
        paddingHorizontal: 16,
        paddingBottom: 10,
    },

    locationCard: {
        width: 225,
        padding: 12,
        marginRight: 12,
        borderRadius: 13,
        backgroundColor: "#F8F8F8",
        borderWidth: 1.5,
        borderColor: "#EAEAEA",
    },

    selectedCard: {
        borderColor: "#C62828",
        backgroundColor: "#FFF8F8",
    },

    cardTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },

    titleStatus: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },

    cardTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#252525",
    },

    radioOuter: {
        width: 21,
        height: 21,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: "#C62828",
        justifyContent: "center",
        alignItems: "center",
    },

    radioInner: {
        width: 11,
        height: 11,
        borderRadius: 6,
        backgroundColor: "#C62828",
    },

    distance: {
        fontSize: 12,
        color: "#777",
        marginTop: 8,
    },

    statusBadge: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 20,
    },

    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        marginRight: 6,
    },

    statusText: {
        fontSize: 12,
        fontWeight: "600",
    },

    capacityText: {
        fontSize: 11,
        color: "#555",
        marginTop: 8,
    },

    selectLabel: {
        fontSize: 11,
        fontWeight: "600",
        color: "#C62828",
        marginTop: 9,
    },

    footer: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        marginTop: "auto",
        marginBottom: 500,
    },

    submitButton: {
        backgroundColor: "#C62828",
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
    },

    disabledButton: {
        backgroundColor: "#BDBDBD",
    },

    submitText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "700",
    },

    text: {
        fontSize: 15,
        textAlign: "center",
        color: "black",
        marginBottom: 24,
    },

});
 