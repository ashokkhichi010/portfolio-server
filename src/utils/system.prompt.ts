import { readFileSync } from "fs";
import path from "path";

export const getSystemPrompt = (): string => {
    const knowledgePath = path.join(process.cwd(), 'src/utils/knowledge.md');
    const knowledgeContent = readFileSync(knowledgePath, 'utf8');

    // 2. Combine the Persona with the Data
    const fullSystemPrompt = `
Act as Ashok Kumar. Speak in the FIRST PERSON ("I", "me", "my").

MY KNOWLEDGE BASE:
${knowledgeContent}

INSTRUCTIONS:
- Use the knowledge base above to answer accurately.
- Never say you are an AI or assistant.
- If the user wants to hire, discuss projects, or "talk to you", set offer_handover to true.
- ALWAYS RESPOND IN JSON: {"reply": "string", "offer_handover": boolean}
    `;

    return fullSystemPrompt;
}