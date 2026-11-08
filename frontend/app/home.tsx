
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Popup } from '../components/modal';
import ShowLocations from './showLocations';

export default function Home() {
    const [showLocation, setshowLocation] = useState(false);

    // Handles the user's selection
    const handleOptionPress = (option: string) => {
        console.log("User selected:", option);
        if(option == "need help" || option == "urgent") {
            setshowLocation(true);
        }
    };

    if (showLocation) {
        return <ShowLocations onSelectionComplete={() => {}} />;
    }

    return (
        <View style={styles.container}>
            <Popup
                isOpen={true}
                onOptionPress={handleOptionPress}
                onClose={() => setshowLocation(true)}
            />
        </View>
    );
}


// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ED1D24',
    alignItems: 'center',
    justifyContent: 'center'
  },

});