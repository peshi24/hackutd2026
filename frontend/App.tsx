import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chat } from './app/chat';
import ShowLocations from './app/showLocations';
import type { LocationSelection } from './app/showLocations';

export default function App() {
  const [locationSelection, setLocationSelection] =
    useState<LocationSelection | null>(null);

  return (
    <View style={styles.container}>
      {locationSelection ? (
        <Chat locationSelection={locationSelection} />
          ) : (
        <ShowLocations onSelectionComplete={setLocationSelection} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
