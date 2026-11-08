
import React from 'react';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Popup } from '../components/modal';

export default function Home() {
    // Handles the user's selection
    const handleOptionPress = (option: string) => {
        console.log("User selected:", option);
        if(option === "need help" || option === "urgent") {
            router.push("/showLocations");
        }
    };

    return (
        <View style={styles.container}>
            <Popup
                isOpen={true}
                onOptionPress={handleOptionPress}
                onClose={() => router.push("/showLocations")}
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