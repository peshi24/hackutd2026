
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function Navbar() {
    return (
        <View style={styles.container}>

            {/* State Farm icon fixed to the left */}
            <Image
                source={require('../assets/logo.png')}
                style={styles.leftImage}
                resizeMode="contain"
            />

            {/* State Farm title centered in the navbar */}
            <Image
                source={require('../assets/statefarm_logo.png')}
                style={styles.middleTitle}
                resizeMode="contain"
            />

        </View>
    );
}

const styles = StyleSheet.create({

    // Overall navbar
    container: {
        height: 65,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        marginTop: 30,

        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',

        position: 'relative',
    },

    // Logo stays on the left
    leftImage: {
        width: 42,
        height: 42,
        resizeMode: 'contain',
    },

    // Title stays centered regardless of left logo
    middleTitle: {
        position: 'absolute',
        width: 150,
        height: 40,
        left: '50%',
        transform: [{ translateX: -58 }],
        resizeMode: 'contain',
    },

});
