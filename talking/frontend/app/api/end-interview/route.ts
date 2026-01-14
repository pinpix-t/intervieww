import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface GeminiAnalysis {
  score: number;
  decision: 'Strong Hire' | 'Hire' | 'Weak' | 'Reject';
  top_strength: string;
  top_weakness: string;
  red_flag: boolean;
  summary: string;
}

export async function POST(request: Request) {
  try {
    const { candidateId, transcript } = await request.json();

    if (!candidateId || !transcript) {
      return NextResponse.json(
        { error: 'Missing candidateId or transcript' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch candidate data
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('job_id, resume_text')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      console.error('Failed to fetch candidate:', candidateError);
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Step 2: Fetch job details
    let jobTitle = 'Unknown Position';
    let jobDescription = '';

    if (candidate.job_id) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('title, description')
        .eq('id', candidate.job_id)
        .single();

      if (!jobError && job) {
        jobTitle = job.title || 'Unknown Position';
        jobDescription = job.description || '';
      }
    }

    // Step 3: Initialize Gemini
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!googleApiKey) {
      console.error('Missing Google API key');
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Prepare resume excerpt (first 500 chars)
    const resumeExcerpt = candidate.resume_text 
      ? candidate.resume_text.substring(0, 500) 
      : 'No resume provided';

    // Format transcript if it's an array
    const transcriptText = Array.isArray(transcript) 
      ? transcript.join('\n') 
      : transcript;

    // Step 4: The Judge - Gemini Analysis
    const prompt = `You are a strict technical recruiter. Analyze this interview transcript against the Job Description and Resume.

JOB TITLE: ${jobTitle}
JOB DESCRIPTION: ${jobDescription}
RESUME HIGHLIGHTS: ${resumeExcerpt}

TRANSCRIPT:
${transcriptText}

TASK: Output strictly valid JSON (no markdown, no code blocks) with this exact schema:
{
  "score": (integer 0-100),
  "decision": ("Strong Hire" | "Hire" | "Weak" | "Reject"),
  "top_strength": (string, max 10 words),
  "top_weakness": (string, max 10 words),
  "red_flag": (boolean - true if candidate lied or totally failed),
  "summary": (string, max 2 sentences)
}

Respond with ONLY the JSON object, nothing else.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    // Clean up response (remove markdown code blocks if present)
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let analysis: GeminiAnalysis;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleanedResponse);
      // Default analysis if parsing fails
      analysis = {
        score: 50,
        decision: 'Weak',
        top_strength: 'Unable to analyze',
        top_weakness: 'Analysis failed',
        red_flag: false,
        summary: 'Interview analysis could not be completed automatically.',
      };
    }

    // Step 5: Save to database
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        interview_transcript: transcriptText,
        rating: analysis.score,
        ai_summary: analysis.summary,
        status: 'INTERVIEWED',
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Failed to update candidate:', updateError);
      return NextResponse.json(
        { error: 'Failed to save interview data' },
        { status: 500 }
      );
    }

    console.log(`[End Interview] Candidate ${candidateId} scored ${analysis.score}/100 - ${analysis.decision}`);

    // Step 6: Return success with analysis
    return NextResponse.json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.error('End interview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

