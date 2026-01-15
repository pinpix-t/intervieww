'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

interface JobGenerationParams {
  title: string;
  salary: string;
  location: string;
  experienceLevel?: string;
  keySkills?: string;
  employmentType?: string;
  mustHave?: string;
  niceToHave?: string;
  companyPerks?: string;
}

export async function generateJobDescription(params: JobGenerationParams): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Build context from optional fields
  const contextParts: string[] = [];
  
  if (params.experienceLevel) {
    contextParts.push(`Experience Level: ${params.experienceLevel}`);
  }
  if (params.keySkills) {
    contextParts.push(`Key Skills Required: ${params.keySkills}`);
  }
  if (params.employmentType) {
    contextParts.push(`Employment Type: ${params.employmentType}`);
  }
  if (params.mustHave) {
    contextParts.push(`Must-Have Requirements: ${params.mustHave}`);
  }
  if (params.niceToHave) {
    contextParts.push(`Nice-to-Have: ${params.niceToHave}`);
  }
  if (params.companyPerks) {
    contextParts.push(`Company Perks to Highlight: ${params.companyPerks}`);
  }

  const additionalContext = contextParts.length > 0 
    ? `\n\nADDITIONAL CONTEXT:\n${contextParts.join('\n')}`
    : '';

  const prompt = `You are an expert Technical Recruiter at a fast-growing company. Write a professional job description.

CORE DETAILS:
- Job Title: ${params.title}
- Location: ${params.location}
- Salary: ${params.salary}${additionalContext}

INSTRUCTIONS:
1. Start with Location and Salary clearly stated.
2. If experience level is provided, tailor the tone accordingly (Junior = learning-focused, Senior = leadership-focused).
3. If key skills are provided, incorporate them naturally into requirements.
4. Separate Must-Have requirements from Nice-to-Have if both are provided.
5. If company perks are provided, create a compelling "Why Join Us" section.
6. If no additional context is given, infer appropriately based on the salary and title.

OUTPUT FORMAT:
- Use clean Markdown (## for headers, - for bullets).
- Sections: Role Summary, Key Responsibilities, Requirements, Nice-to-Have (if applicable), Why Join Us.
- Tone: Professional, direct, and compelling. No fluff or buzzword overload.
- Keep it concise but thorough.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return text;
}
