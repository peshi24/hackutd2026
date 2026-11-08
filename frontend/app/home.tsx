
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Popup } from '../components/modal';
import { Chat } from './chat';

export default function Home() {
    const [showChat, setShowChat] = useState(false);

    // Handles the user's selection
    const handleOptionPress = (option: string) => {
        console.log("User selected:", option);
        setShowChat(true);
    };

    if (showChat) {
        return <Chat />;
    }

    return (
        <View style={styles.container}>
            <Popup
                isOpen={true}
                onOptionPress={handleOptionPress}
                onClose={() => setShowChat(true)}
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