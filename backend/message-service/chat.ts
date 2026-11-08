import { GoogleGenAI } from "@google/genai";

// Automatically picks up GEMINI_API_KEY from process.env
const ai = new GoogleGenAI();

export const getDisasterResponse = async (incomingText: string): Promise<string> => {
  const text = incomingText.toLowerCase().trim();

  if (text === "1") {
    return "State Farm Aid: You selected Hotels. Please provide your city or zip code.";
  } else if (text === "2") {
    return "State Farm Aid: You selected Aid Trailers. Food and water are available at central distribution sites.";
  } else if (text === "3") {
    return "State Farm Aid: You selected Transport. Please state how many people need evacuation.";
  }

  // Default menu
  return "State Farm Aid: We received your request. Are you looking for (1) Hotels, (2) Aid Trailers, or (3) Transport?";
};

async function callGemini(userPrompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Fast and lightweight for hackathons
      contents: userPrompt,
    });
    
    console.log("Gemini Output:", response.text);
    return response.text;
  } catch (error) {
    console.error("Error talking to Gemini:", error);
  }
}