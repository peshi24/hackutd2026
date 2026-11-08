import { useLocalSearchParams } from "expo-router";
import { Chat } from "../../app/chat";
import type { LocationSelection } from "../../app/showLocations";

export default function ChatRoute() {
  const params = useLocalSearchParams<{
    trailerName?: string;
    distanceMiles?: string;
    canTravel?: string;
    address?: string;
    latitude?: string;
    longitude?: string;
  }>();

  const distanceMiles = Number(params.distanceMiles);
  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);
  const locationSelection: LocationSelection | undefined =
    typeof params.trailerName === "string" &&
    typeof params.address === "string" &&
    (params.canTravel === "true" || params.canTravel === "false") &&
    Number.isFinite(distanceMiles) &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? {
          trailerName: params.trailerName,
          distanceMiles,
          canTravel: params.canTravel === "true",
          address: params.address,
          latitude,
          longitude,
        }
      : undefined;

  return <Chat locationSelection={locationSelection} />;
}
