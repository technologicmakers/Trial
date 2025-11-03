import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Tab, ControlSettings } from '../types';

const geminiSchemaMetadata = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        category: { type: Type.STRING }
    },
    required: ["title", "description", "keywords", "category"]
};

const geminiSchemaPrompt = {
    type: Type.OBJECT,
    properties: {
        description: { type: Type.STRING }
    },
    required: ["description"]
};

export const createPrompt = (settings: ControlSettings, mode: Tab): string => {
    const { 
        customPromptSelect, customPromptEntry,
        promptSwitches, customPromptEntryPrompt,
        titleLength, descLength, keywordsCount, descWords
    } = settings;

    // Handle custom prompts first
    if (mode === 'prompt' && promptSwitches.customPrompt && customPromptEntryPrompt.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntryPrompt.trim()}\n\nProvide JSON object with only 'description'.`;
    }
    if (mode === 'metadata' && customPromptSelect === 'set_custom' && customPromptEntry.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntry.trim()}\n\nProvide JSON object with 'title', 'description', 'keywords', and a relevant 'category'.`;
    }

    // Default prompt generation
    let prompt = `Act as an expert metadata generator specializing in stock media requirements.\nAnalyze this image.\nIMPORTANT: If the subject is isolated, assume it's on a white or transparent background. Do NOT mention "black background", "dark background", or similar phrases.\n`;

    if (mode === 'prompt') {
        prompt += `Generate only a compelling description.\nTarget Description Length: MUST BE EXACTLY ${descWords} words. Provide the exact word count requested.\n`;
        if (promptSwitches.silhouette) prompt += "Style: Silhouette. Emphasize this.\n";
        if (promptSwitches.whiteBg) prompt += "Background: Plain white. Mention 'white background', 'isolated'.\n";
        if (promptSwitches.transparentBg) prompt += "Background: Transparent. Mention 'transparent background', 'isolated'.\n";
        prompt += "Focus on facts and concepts, avoiding subjective words (e.g., beautiful, amazing).\n\nProvide JSON object with only 'description'.";
    } else { // metadata mode
        prompt += `Generate Title, Description, Keywords, and Category for stock media sites.\n`;
        prompt += `Title: MUST BE EXACTLY ${titleLength} characters long. Provide the exact character count requested. Be descriptive, accurate, concise.\n`;
        prompt += `Description: MUST BE EXACTLY ${descLength} characters long. Provide the exact character count requested. Be informative.\n`;
        prompt += `Keywords: MUST BE EXACTLY ${keywordsCount} keywords. Provide the exact number of keywords requested. Order by importance (most relevant first), include conceptual keywords.\n`;
        prompt += `Category: Select the single most relevant category (e.g., Nature, Business, People, Technology, Food, Abstract).\n`;
        prompt += `Rules: Keywords must be relevant and specific. Avoid spamming, subjective words (beautiful, amazing), plurals if singular exists, technical details unless essential. Capitalize only the first letter of the Title.\n\n`;
        prompt += "Provide JSON object with 'title', 'description', 'keywords', and 'category'.";
    }
    return prompt;
};

export const callApiWithBackoff = async (
    ai: GoogleGenAI,
    modelName: string,
    prompt: string,
    apiData: { base64Data: string; mimeType: string } | null,
    settings: ControlSettings,
    mode: Tab,
    onRetry: (delay: number) => void
): Promise<any> => {
    if (!apiData) throw new Error("API data is missing.");
    
    const schema = (mode === 'prompt') ? geminiSchemaPrompt : geminiSchemaMetadata;
    let delay = 1000;
    const maxDelay = 30000; // 30-second maximum delay

    while (true) {
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: modelName,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: apiData.mimeType, data: apiData.base64Data } }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            
            const resultText = response.text;
            if (!resultText) {
                 const safetyReason = response.candidates?.[0]?.finishReason;
                 if (safetyReason === 'SAFETY') {
                    console.warn("API Debug (Safety Block):", JSON.stringify(response, null, 2));
                    throw new Error("Blocked by safety settings.");
                 }
                 console.warn("API Debug (No Text):", JSON.stringify(response, null, 2));
                 throw new Error("Invalid API response structure.");
            }
            
            let metadata = JSON.parse(resultText);
            
            if (mode === 'metadata') {
                 const { advanceTitle, keywordsCount } = settings;
                 let baseTitle = metadata.title ? metadata.title.charAt(0).toUpperCase() + metadata.title.slice(1).toLowerCase() : "";
                 
                 const opts = [];
                 if (advanceTitle.transparentBg) opts.push("isolated on transparent background");
                 if (advanceTitle.whiteBg) opts.push("isolated on white background");
                 if (advanceTitle.vector) opts.push("Vector");
                 if (advanceTitle.illustration) opts.push("illustration");
                 const toggleText = opts.length > 0 ? " " + opts.join(', ') : "";

                 metadata.title = baseTitle + toggleText;

                 let combinedKeywords = (metadata.keywords || []).map((kw: string) => kw.trim().toLowerCase()).filter(Boolean);
                 const toggleKeywordsLower = opts.map(kw => kw.toLowerCase());
                 toggleKeywordsLower.forEach((tk) => {
                     if (!combinedKeywords.includes(tk)) combinedKeywords.push(tk);
                 });
                 
                 metadata.keywords = [...new Set(combinedKeywords)].slice(0, keywordsCount);
            }

            return metadata;

        } catch (error: any) {
            console.warn(`API call failed. Retrying in ${delay / 1000}s...`, error.message);
            onRetry(delay);
            await new Promise(res => setTimeout(res, delay));
            delay = Math.min(delay * 2, maxDelay); // Exponential backoff with a cap
        }
    }
};