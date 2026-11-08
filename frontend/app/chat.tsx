
import React, { useRef, useState } from "react";

import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// Import the Navbar component
import Navbar from "../components/navbar";

type Message = {
    id: string;
    sender: string;
    text: string;
};

export function Chat() {

    // Sample conversation (will eventually come from backend)
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            sender: "statefarm",
            text: "What type of help do you need?",
        },
        {
            id: "2",
            sender: "user",
            text: "I'm trapped in my home because the streets around me are flooded, and I don't have a way to get out. My electricity has been out since the storm, and I'm starting to run low on my medication. I'm also running out of food and drinking water. I live alone, and I'm scared that no one knows I'm still here. I really need someone to help me evacuate and get my medication.",
        },
        {
            id: "3",
            sender: "statefarm",
            text: "So you need assistance with getting out, food, medication, correct?",
        },
        {
            id: "4",
            sender: "user",
            text: "yes.",
        },
        {
            id: "5",
            sender: "statefarm",
            text: "Help will be there in 15 minutes.",
        },
        {
            id: "6",
            sender: "statefarm",
            text: "Please keep texting if you need anything else. You will be notified as soon as help is here.",
        },
    ]);

    // Stores the user's current input
    const [input, setInput] = useState("");

    // Reference to FlatList for automatic scrolling
    const flatListRef = useRef<FlatList<Message>>(null);


    // Function to send a message
    const handleSend = () => {

        // Prevent sending empty messages
        if (input.trim() === "") return;

        // Create a new message
        const newMessage: Message = {
            id: Date.now().toString(),
            sender: "user",
            text: input.trim(),
        };

        // Add the message to the conversation
        setMessages((prevMessages: Message[]) => [
            ...prevMessages,
            newMessage,
        ]);

        // Clear the input box
        setInput("");
    };


    // Render individual chat messages
    const renderMessage = ({ item }: { item: Message }) => {

        // Check whether the message came from State Farm
        const isRep = item.sender === "statefarm";

        // STATE FARM REPRESENTATIVE MESSAGE
        if (isRep) {
            return (
                <View style={styles.repContainer}>

                    <View style={styles.repBubble}>
                        <Text style={styles.repText}>
                            {item.text}
                        </Text>
                    </View>

                </View>
            );
        }

        // USER MESSAGE
        return (
            <View style={styles.userContainer}>

                <View style={styles.userBubble}>
                    <Text style={styles.userText}>
                        {item.text}
                    </Text>
                </View>

            </View>
        );
    };


    return (

        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >

            {/* ================= NAVBAR ================= */}

            <Navbar />


            {/* ================= CHAT AREA ================= */}

            <View style={styles.container}>

                <FlatList

                    // Connect FlatList to its reference
                    ref={flatListRef}

                    // Display conversation messages
                    data={messages}

                    // Give each message a unique ID
                    keyExtractor={(item) => item.id}

                    // Determine how each message looks
                    renderItem={renderMessage}

                    // Add spacing around messages
                    contentContainerStyle={styles.chatContent}

                    // Allow messages to scroll vertically
                    showsVerticalScrollIndicator={false}

                    // Automatically scroll to newest message
                    onContentSizeChange={() =>
                        flatListRef.current?.scrollToEnd({
                            animated: true,
                        })
                    }

                    // Improve keyboard interaction
                    keyboardShouldPersistTaps="handled"
                />

            </View>


            {/* ================= USER INPUT BAR ================= */}

            <View style={styles.inputContainer}>

                {/* Text input */}
                <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Type a message..."
                    placeholderTextColor="#888888"
                    multiline
                />

                {/* Send button */}
                <TouchableOpacity
                    style={styles.sendButton}
                    onPress={handleSend}
                    activeOpacity={0.7}
                >
                    <Text style={styles.sendButtonText}>
                        Send
                    </Text>
                </TouchableOpacity>

            </View>

        </KeyboardAvoidingView>
    );
}


// ================= STYLES =================

const styles = StyleSheet.create({

    // Overall screen
    screen: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },

    // Chat area fills available space between navbar and input
    container: {
        flex: 1,
        paddingHorizontal: 15,
    },

    // Spacing between messages
    chatContent: {
        paddingVertical: 20,
        gap: 15,
        flexGrow: 1,
    },


    /*==================== STATE FARM REPRESENTATIVE ====================*/

    // Align representative messages to the left
    repContainer: {
        alignSelf: "flex-start",
        maxWidth: "85%",
    },

    // Red representative bubble
    repBubble: {
        backgroundColor: "#ED1D24",
        borderRadius: 25,
        paddingHorizontal: 22,
        paddingVertical: 16,
    },

    // Representative text
    repText: {
        color: "#FFFFFF",
        fontSize: 15,
        textAlign: "left",
        fontWeight: "500",
    },


    /*==================== USER MESSAGES ====================*/

    // Align user messages to the right
    userContainer: {
        alignSelf: "flex-end",
        maxWidth: "80%",
    },

    // Grey user bubble
    userBubble: {
        backgroundColor: "#D9D9D9",
        borderRadius: 25,
        paddingHorizontal: 22,
        paddingVertical: 16,
    },

    // User text
    userText: {
        color: "#222222",
        fontSize: 15,
        textAlign: "left",
    },


    /*==================== INPUT BAR ====================*/

    // Fixed input bar at the bottom
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
        paddingVertical: 12,
        gap: 10,
        marginBottom: 45,

        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E0E0E0",
    },

    // User text input
    input: {
        flex: 1,
        minHeight: 45,
        maxHeight: 110,

        backgroundColor: "#F2F2F2",
        borderRadius: 25,

        paddingHorizontal: 18,
        paddingVertical: 12,

        fontSize: 15,
        color: "#222222",
    },

    // Red send button
    sendButton: {
        backgroundColor: "#ED1D24",
        borderRadius: 25,

        paddingHorizontal: 20,
        paddingVertical: 13,

        justifyContent: "center",
        alignItems: "center",
    },

    sendButtonText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "600",
    },

});
