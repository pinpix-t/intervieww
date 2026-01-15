'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

interface DossierResult {
  success: boolean;
  dossier?: string[];
  error?: string;
}

export async function generateDossier(candidateId: string): Promise<DossierResult> {
  try {
    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch candidate data
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('interview_transcript, job_description, job_id')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      console.error('Failed to fetch candidate:', fetchError);
      return { success: false, error: 'Candidate not found' };
    }

    // Get job description from jobs table if not on candidate
    let jobDesc = candidate.job_description || '';
    if (!jobDesc && candidate.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('description, title')
        .eq('id', candidate.job_id)
        .single();
      
      if (job) {
        jobDesc = `${job.title}: ${job.description || ''}`;
      }
    }

    const transcript = candidate.interview_transcript;
    
    if (!transcript) {
      console.error('No transcript found for candidate');
      return { success: false, error: 'No interview transcript found' };
    }

    // Initialize Gemini
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'AI service not configured' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Generate the dossier
    const prompt = `You are a Senior Technical Architect preparing for a technical interview.

CANDIDATE'S ROUND 1 INTERVIEW TRANSCRIPT:
${transcript.substring(0, 4000)}

JOB DESCRIPTION:
${jobDesc.substring(0, 1000) || 'Software Engineering Role'}

YOUR TASK:
Analyze the transcript and identify 3 specific technical claims, projects, or accomplishments the candidate mentioned.
For EACH claim, write one "Probe Question" that tests their DEEP technical understanding.

RULES FOR PROBE QUESTIONS:
- Ask for specific implementation details (e.g., "How exactly did you handle race conditions?")
- Ask about tradeoffs and decisions (e.g., "Why did you choose that approach over X?")
- Ask about scale and metrics (e.g., "How many requests per second? What was the latency?")
- Do NOT accept buzzwords - these questions should expose if they actually built it vs. just talked about it

OUTPUT FORMAT:
Return ONLY a valid JSON array of exactly 3 question strings. No markdown, no explanation.
Example: ["Question 1 here?", "Question 2 here?", "Question 3 here?"]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Clean up response
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let dossier: string[];
    try {
      dossier = JSON.parse(cleanedResponse);
      if (!Array.isArray(dossier) || dossier.length === 0) {
        throw new Error('Invalid dossier format');
      }
    } catch (parseError) {
      console.error('Failed to parse dossier:', cleanedResponse);
      // Fallback questions
      dossier = [
        "Walk me through a technical challenge you mentioned. What was your specific role in solving it?",
        "You mentioned working with certain technologies. Can you explain the architecture decisions you made?",
        "Tell me about a time you had to debug a complex issue. What was your systematic approach?"
      ];
    }

    // Update the candidate record
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        round_1_dossier: dossier,
        current_stage: 'round_2',
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Failed to update candidate with dossier:', updateError);
      return { success: false, error: 'Failed to save dossier' };
    }

    console.log(`[Dossier] Generated ${dossier.length} probe questions for candidate ${candidateId}`);
    
    return { success: true, dossier };

  } catch (error) {
    console.error('Generate dossier error:', error);
    return { success: false, error: 'Failed to generate dossier' };
  }
}

