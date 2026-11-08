
import React, { useRef } from "react";

import {
    FlatList,
    StyleSheet,
    Text,
    View,
} from "react-native";

type Message = {
    id: string;
    sender: string;
    text: string;
};


export function Chat() {

    // These messages are hardcoded for now.
    // Later, we can replace this array with backend data.

    const messages = [
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
    ];


    // Reference to the FlatList so we can control scrolling
    const flatListRef = useRef<FlatList<Message>>(null);


    const renderMessage = ({ item }: { item: Message }) => {

        // Check whether the message came from State Farm
        const isRep = item.sender === "statefarm";


        // STATE FARM REPRESENTATIVE MESSAGE
        if (isRep) {

            return (
                <View style={styles.repContainer}>

                        {/* red speech bubble */}
                    <View style={styles.repBubble}>

                        {/* Display rep's message */}
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

                {/* Grey speech bubble */}
                <View style={styles.userBubble}>

                    {/* Display user's message */}
                    <Text style={styles.userText}>
                        {item.text}
                    </Text>

                </View>

            </View>
        );
    };

    return (

        <View style={styles.container}>

            <FlatList

                // Connect FlatList to our reference
                ref={flatListRef}

                // Provide our sample conversation
                data={messages}

                // Give each message a unique ID
                keyExtractor={(item) => item.id}

                // Determine how each message looks
                renderItem={renderMessage}

                // Add spacing around messages
                contentContainerStyle={styles.chatContent}

                // Automatically scroll to the newest message
                onContentSizeChange={() =>
                    flatListRef.current?.scrollToEnd({
                        animated: true,
                    })
                }

            />

        </View>
    );
}

const styles = StyleSheet.create({

    // Overall chat screen
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 15,
    },

    // Spacing between messages
    chatContent: {
        paddingVertical: 20,
        gap: 15,
    },


    /*==================== STATE FARM REPRESENTATIVE ====================*/
    // Align representative messages to the left
    repContainer: {
        alignSelf: "flex-start",
        maxWidth: "85%",
    },

    // Dimensions of the red bubble
    repBubble: {
        backgroundColor: '#ED1D24',
        borderRadius: 25,
        paddingHorizontal: 22,
        paddingVertical: 16,
    },


    // Representative's text styling
    repText: {
        color: "#FFFFFF",
        fontSize: 15,
        textAlign: "left",
        fontWeight: "500",
    },


    // USER

    // Align user messages to the right
    userContainer: {
        alignSelf: "flex-end",
        maxWidth: "80%",
    },

    // Grey user speech bubble
    userBubble: {
        backgroundColor: "#D9D9D9",
        borderRadius: 25,
        paddingHorizontal: 22,
        paddingVertical: 16,
    },

    // User text styling
    userText: {
        color: "#222222",
        fontSize: 15,
        textAlign: "left",
    },

});
