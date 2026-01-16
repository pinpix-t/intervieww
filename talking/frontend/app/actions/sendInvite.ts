'use server';

import { createClient } from '@supabase/supabase-js';

const INTERVIEW_BASE_URL = 'https://intervieww-fw4n.vercel.app/interview';
const ROUND2_BASE_URL = 'https://intervieww-fw4n.vercel.app/round2';

interface SendInviteResult {
  success: boolean;
  error?: string;
}

export async function sendInterviewInvite(candidateId: number): Promise<SendInviteResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch candidate
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('email, full_name, interview_token')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      return { success: false, error: 'Candidate not found' };
    }

    if (!candidate.interview_token) {
      return { success: false, error: 'No interview token found' };
    }

    const interviewLink = `${INTERVIEW_BASE_URL}/${candidate.interview_token}`;

    // Send email via Resend or similar (for now, just log and update status)
    console.log(`[Send Invite] Would send email to ${candidate.email}`);
    console.log(`[Send Invite] Interview link: ${interviewLink}`);

    // For now, we'll use a simple fetch to a hypothetical email endpoint
    // You can integrate with Resend, SendGrid, etc. later
    
    // Update candidate status
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ status: 'INVITE_SENT' })
      .eq('id', candidateId);

    if (updateError) {
      return { success: false, error: 'Failed to update status' };
    }

    return { success: true };
  } catch (error) {
    console.error('Send invite error:', error);
    return { success: false, error: 'Failed to send invite' };
  }
}

export async function inviteToRound2(candidateId: number): Promise<SendInviteResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch candidate
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('email, full_name, interview_token, current_stage')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      return { success: false, error: 'Candidate not found' };
    }

    // Update to round 2
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ 
        current_stage: 'round_2',
        status: 'ROUND_2_INVITED'
      })
      .eq('id', candidateId);

    if (updateError) {
      return { success: false, error: 'Failed to update status' };
    }

    const round2Link = `${ROUND2_BASE_URL}/${candidate.interview_token}`;
    console.log(`[Round 2 Invite] Would send email to ${candidate.email}`);
    console.log(`[Round 2 Invite] Link: ${round2Link}`);

    return { success: true };
  } catch (error) {
    console.error('Invite to round 2 error:', error);
    return { success: false, error: 'Failed to invite to round 2' };
  }
}

