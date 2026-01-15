'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateJobDescription(
  title: string,
  salary: string,
  location: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an expert Technical Recruiter. Write a job description for a '${title}' in '${location}' offering '${salary}'.

CRITICAL ANALYSIS:
- Analyze the salary relative to the location.
- If salary is HIGH for the region -> Write for a Senior/Strategic role (Leadership, System Design, Mentorship).
- If salary is LOW for the region -> Write for a Junior/Entry role (Learning, Execution, Hard Work).
- If average -> Mid-level role.

OUTPUT FORMAT:
- Use clean Markdown (## for headers, * for bullets).
- Start with Location and Salary clearly stated at the top.
- Sections: 'Role Summary', 'Key Responsibilities', 'Requirements', 'Why Join Us'.
- Tone: Professional, exciting, and direct.
- Keep it concise but compelling.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return text;
}

