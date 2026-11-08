
import React, { useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    ImageBackground,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from "react-native";

import { useRouter } from "expo-router";

const backgroundImage = require("../assets/background.png");

export default function Login() {
    // Store the user's email address
    const [email, setEmail] = useState("");

    // Initialize navigation
    const router = useRouter();

    // Navigate to authorization when the user submits their email
    const handleSubmit = () => {
        if (!email.trim()) {
            alert("Please enter your email address.");
            return;
        }

        router.push("/authorization");
    };

    return (
        <View style={styles.overlay}>
        <ImageBackground
            source={backgroundImage}
            resizeMode="cover"
            imageStyle={{ transform: [{ translateY: 50 }] }}

            style={styles.background}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.container}
            >
                {/* Main login content */}
                <View style={styles.content}>
                    {/* Email input */}
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Enter Email Address"
                        placeholderTextColor="#888"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {/* Submit button */}
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleSubmit}
                    >
                        <Text style={styles.buttonText}>
                            Submit
                        </Text>
                    </TouchableOpacity>

                </View>
                <Text style={styles.smallText}>
                    Welcome to
                </Text>
                <Text style={styles.bigText}>
                    WeatherTogether
                </Text>
            </KeyboardAvoidingView>
        </ImageBackground>
        </View>
    );
}

// Styles
const styles = StyleSheet.create({

    //transparent background overlay
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Background image fills the entire screen
    background: {
        flex: 1,
        width: "100%",
        height: "100%",
        backgroundColor: "#A71620",
    },

    // Centers content on the screen
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    content: {
        width: "85%",
        alignItems: "center",
    },

    // Welcome text
    smallText: {
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        textAlignVertical: "top",
        fontSize: 20,
        fontStyle: "italic",
        fontWeight: "bold",
        color: "#fff",
        textAlign: "center",
    },

    bigText: {
        position: "absolute",
        top: 175,
        left: 0,
        right: 0,
        textAlignVertical: "top",
        fontSize: 35,
        fontStyle: "italic",
        fontWeight: "bold",
        color: "#fff",
        textAlign: "center",
    },

    // Email input field
    input: {
        width: "100%",
        height: 50,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        paddingHorizontal: 15,
        fontSize: 16,
        color: "#333",
        backgroundColor: "#fff",
        marginBottom: 20,
    },

    // Submit button
    button: {
        width: "100%",
        height: 50,
        backgroundColor: "#E31837",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },

    buttonText: {
        color: "#fff",
        fontSize: 17,
        fontWeight: "bold",
    },

});
