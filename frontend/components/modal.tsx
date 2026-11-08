
import React from 'react';
import {
    Modal,
    Text,
    View,
    TouchableOpacity,
    StyleSheet,
    ModalProps,
} from 'react-native';

// Define the props that the Popup component accepts
type PROPS = ModalProps & {
    isOpen: boolean;
    withInput?: boolean;

    // Optional callback functions for the buttons
    onOptionPress?: (option: string) => void;
    onClose?: () => void;
};

export const Popup = ({
    isOpen,
    withInput = false,
    children,
    onOptionPress,
    onClose,
    ...rest
}: PROPS) => {

    // Store the button options if the user is in the location from the database
    const options = [
        { label: "I need immediate care", value: "help" },
        { label: "I need some help", value: "okay" },
        { label: "I'm fine", value: "unsure" },
    ];

    return (
        <Modal
            visible={isOpen}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
            onRequestClose={onClose}
            {...rest}
        >
            {/* Dark transparent background behind the popup */}
            <View style={styles.overlay}>

                {/* Main popup container */}
                <View style={styles.popupContainer}>

                    {/* Popup heading */}
                    <Text style={styles.title}>
                        Are you okay right now?
                    </Text>

                    {/* Body message for the notification */}
                    <Text style={styles.bodyText}>
                        We understand that you may be affected by the recent natural disaster. Let us know what kind of assistance you need so we can help guide you to the right resources. 
                        {'\n\n'} Your safety is our priority.
                    </Text>

                    {/* Render the three buttons dynamically */}
                    <View style={styles.buttonContainer}>
                        {options.map((option) => (
                            <TouchableOpacity
                                key={option.value}
                                style={styles.optionButton}
                                onPress={() => onOptionPress?.(option.value)}
                            >
                                <Text style={styles.buttonText}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Display optional custom content passed from the parent */}
                    {withInput && children}

                </View>
            </View>
        </Modal>
    );
};

// Styles for the popup
const styles = StyleSheet.create({
    // Semi-transparent background covering the screen
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },

    // White popup card
    popupContainer: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },

    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginTop: 12,
        marginBottom: 12,
        color: '#222222',
    },

    bodyText: {
        fontSize: 15,
        textAlign: 'center',
        color: '#666666',
        marginBottom: 24,
    },

    buttonContainer: {
        width: '100%',
        gap: 12,
    },

    optionButton: {
        backgroundColor: '#E8E8E8',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
    },

    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#222222',
    },
});
