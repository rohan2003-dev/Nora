import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateNoraResponse = async (prompt: string, history: { role: string, parts: { text: string }[] }[]) => {
  try {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: `You are Nora, a highly intelligent and friendly browser AI assistant. 
        Your goal is to help users navigate the web, play media, and automate tasks.
        Keep your responses short, natural, and human-like (max 2 sentences).
        If the user asks to do something (open a site, play music, send message), acknowledge it briefly.
        
        You can detect intents for:
        - OPEN: URL
        - SEARCH: Query
        - PLAY_YOUTUBE: Song/Artist
        - PLAY_SPOTIFY: Song/Artist
        - WHATSAPP: Contact Name, Message
        
        Always respond in plain text. If you detect an action, include a special tag at the end like [ACTION:TYPE:PAYLOAD].
        Example: "Sure, opening YouTube for you. [ACTION:OPEN:https://youtube.com]"
        Example: "Playing Kesariya on YouTube. [ACTION:PLAY_YOUTUBE:Kesariya]"
        Example: "Searching for AI tools. [ACTION:SEARCH:AI tools]"
        Example: "Sending that message to Rahul. [ACTION:WHATSAPP:Rahul|I'm busy]"`,
        temperature: 0.7,
      }
    });

    const result = await model;
    return result.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm having a bit of trouble connecting right now.";
  }
};
