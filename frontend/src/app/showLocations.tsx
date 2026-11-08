import { router } from "expo-router";
import ShowLocations, { type LocationSelection } from "../../app/showLocations";

export default function ShowLocationsRoute() {
  const handleSelectionComplete = (selection: LocationSelection) => {
    router.replace({
      pathname: "/chat",
      params: {
        trailerName: selection.trailerName,
        distanceMiles: String(selection.distanceMiles),
        canTravel: String(selection.canTravel),
        address: selection.address,
        latitude: String(selection.latitude),
        longitude: String(selection.longitude),
      },
    });
  };

  return <ShowLocations onSelectionComplete={handleSelectionComplete} />;
}
