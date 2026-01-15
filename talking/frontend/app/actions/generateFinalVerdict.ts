'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

interface VerdictResult {
  success: boolean;
  verdict?: {
    score: number;
    verdict: string;
    summary: string;
  };
  error?: string;
}

export async function generateFinalVerdict(candidateId: string): Promise<VerdictResult> {
  try {
    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch candidate data including both rounds
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('round_2_transcript, rating, job_description, job_id, full_name')
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

    const round2Transcript = candidate.round_2_transcript;
    const round1Score = candidate.rating || 0;
    
    if (!round2Transcript) {
      console.error('No Round 2 transcript found for candidate');
      return { success: false, error: 'No Round 2 transcript found' };
    }

    // Initialize Gemini
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'AI service not configured' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Generate the final verdict
    const prompt = `You are the Hiring Committee making a final decision on ${candidate.full_name || 'this candidate'}.

JOB: ${jobDesc.substring(0, 1000) || 'Software Engineering Role'}

ROUND 1 SCORE (Personality/Drive): ${round1Score}/100

ROUND 2 TRANSCRIPT (Technical Interview):
${round2Transcript.substring(0, 4000)}

YOUR TASK:
1. Grade the Technical Skills demonstrated in Round 2 (0-100).
2. Provide a Final Verdict based on BOTH rounds.
3. Write a 2-sentence executive summary for the Hiring Manager.

SCORING GUIDE:
- 80-100: Strong technical depth, can explain implementation details, understands tradeoffs
- 60-79: Solid fundamentals, some gaps in depth, capable of learning
- 40-59: Surface-level knowledge, relies on buzzwords, needs significant mentorship  
- 0-39: Does not meet technical bar, unable to explain their own work

VERDICT OPTIONS:
- "Strong Hire" - Both rounds excellent (avg 80+), clear A-player
- "Hire" - Good performance in both (avg 65+), solid candidate
- "Weak Hire" - Mixed signals, might work with mentorship
- "Reject" - Failed one or both rounds, not a fit

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no explanation):
{
  "score": <number 0-100>,
  "verdict": "<Strong Hire | Hire | Weak Hire | Reject>",
  "summary": "<2 sentences for hiring manager>"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Clean up response
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let verdict: { score: number; verdict: string; summary: string };
    try {
      verdict = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse verdict:', cleanedResponse);
      verdict = {
        score: 50,
        verdict: 'Weak Hire',
        summary: 'Technical interview completed but analysis could not be processed automatically. Manual review recommended.'
      };
    }

    // Update the candidate record
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        round_2_rating: verdict.score,
        final_verdict: verdict.verdict,
        current_stage: 'completed',
        status: 'COMPLETED',
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Failed to update candidate with verdict:', updateError);
      return { success: false, error: 'Failed to save verdict' };
    }

    console.log(`[Final Verdict] Candidate ${candidateId}: ${verdict.verdict} (Technical: ${verdict.score}/100)`);
    
    return { success: true, verdict };

  } catch (error) {
    console.error('Generate final verdict error:', error);
    return { success: false, error: 'Failed to generate verdict' };
  }
}

