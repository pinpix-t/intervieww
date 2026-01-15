import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Format transcript if it's an array
    const transcriptText = Array.isArray(transcript) 
      ? transcript.join('\n') 
      : transcript;

    // Save Round 2 transcript to database
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        round_2_transcript: transcriptText,
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Failed to update candidate:', updateError);
      return NextResponse.json(
        { error: 'Failed to save Round 2 transcript' },
        { status: 500 }
      );
    }

    console.log(`[End Interview Round 2] Saved transcript for candidate ${candidateId}`);

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error('End interview round 2 error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

