'use server';

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const INTERVIEW_BASE_URL = 'https://intervieww-fw4n.vercel.app/interview';
const ROUND2_BASE_URL = 'https://intervieww-fw4n.vercel.app/round2';
const COMPANY_NAME = 'Printerpix';

interface SendInviteResult {
  success: boolean;
  error?: string;
}

// Initialize Gmail API using OAuth2 credentials from environment
function getGmailService() {
  const tokenJson = process.env.GOOGLE_TOKEN_JSON;
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!tokenJson || !credentialsJson) {
    console.log('[Gmail] Missing GOOGLE_TOKEN_JSON or GOOGLE_CREDENTIALS_JSON');
    return null;
  }

  try {
    const token = JSON.parse(tokenJson);
    const credentials = JSON.parse(credentialsJson);
    const clientConfig = credentials.installed || credentials.web || {};

    const oauth2Client = new google.auth.OAuth2(
      clientConfig.client_id,
      clientConfig.client_secret,
      'http://localhost'
    );

    oauth2Client.setCredentials({
      access_token: token.token,
      refresh_token: token.refresh_token,
      token_type: 'Bearer',
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  } catch (error) {
    console.error('[Gmail] Failed to initialize:', error);
    return null;
  }
}

// Create email message for Gmail API
function createEmail(to: string, subject: string, htmlBody: string): string {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];
  
  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64url');
}

export async function sendInterviewInvite(candidateId: number): Promise<SendInviteResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch candidate with job info
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('email, full_name, interview_token, job_id')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      return { success: false, error: 'Candidate not found' };
    }

    if (!candidate.interview_token) {
      return { success: false, error: 'No interview token found' };
    }

    // Get job title
    let jobTitle = 'Open Position';
    if (candidate.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('title')
        .eq('id', candidate.job_id)
        .single();
      if (job) {
        jobTitle = job.title;
      }
    }

    const interviewLink = `${INTERVIEW_BASE_URL}/${candidate.interview_token}`;

    // Send email via Gmail API
    const gmail = getGmailService();
    if (gmail) {
      try {
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Great News, ${candidate.full_name}!</h2>
            
            <p>We've reviewed your application for <strong>${jobTitle}</strong> and would like to invite you to an AI Interview.</p>
            
            <p>This is an innovative interview experience where you'll have a conversation with our AI interviewer. It takes about 10-15 minutes and can be done at your convenience.</p>
            
            <div style="margin: 30px 0;">
              <a href="${interviewLink}" 
                 style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Start Your Interview
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Tips for success:</strong><br>
              • Find a quiet place with good lighting<br>
              • Use a computer with a webcam and microphone<br>
              • Speak naturally and be yourself
            </p>
            
            <p>Best of luck!</p>
            <p><strong>${COMPANY_NAME} Recruiting Team</strong></p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #999; font-size: 12px;">
              If the button doesn't work, copy this link: ${interviewLink}
            </p>
          </div>
        `;

        const rawMessage = createEmail(
          candidate.email,
          `You're Invited - AI Interview for ${jobTitle} at ${COMPANY_NAME}`,
          htmlBody
        );

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage },
        });

        console.log(`[Send Invite] Gmail email sent to ${candidate.email}`);
      } catch (emailError) {
        console.error('[Send Invite] Gmail failed:', emailError);
        return { success: false, error: 'Failed to send email via Gmail' };
      }
    } else {
      console.log(`[Send Invite] No Gmail configured - would send to ${candidate.email}`);
      console.log(`[Send Invite] Interview link: ${interviewLink}`);
    }

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

    // Fetch candidate with job info
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('email, full_name, interview_token, job_id, rating')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      return { success: false, error: 'Candidate not found' };
    }

    // Get job title
    let jobTitle = 'Open Position';
    if (candidate.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('title')
        .eq('id', candidate.job_id)
        .single();
      if (job) {
        jobTitle = job.title;
      }
    }

    const round2Link = `${ROUND2_BASE_URL}/${candidate.interview_token}`;

    // Send email via Gmail API
    const gmail = getGmailService();
    if (gmail) {
      try {
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Congratulations, ${candidate.full_name}!</h2>
            
            <p>You've passed Round 1 of our interview process with a score of <strong>${candidate.rating}/100</strong>. Well done!</p>
            
            <p>We'd like to invite you to <strong>Round 2: Technical Interview</strong> for the <strong>${jobTitle}</strong> position.</p>
            
            <p>In this round, you'll meet with our Technical Interviewer who will dive deeper into your technical skills and experience.</p>
            
            <div style="margin: 30px 0;">
              <a href="${round2Link}" 
                 style="background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Start Round 2 Interview
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>What to expect:</strong><br>
              • Technical questions based on your experience<br>
              • Deep dive into projects you've mentioned<br>
              • About 15-20 minutes
            </p>
            
            <p>Good luck!</p>
            <p><strong>${COMPANY_NAME} Recruiting Team</strong></p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #999; font-size: 12px;">
              If the button doesn't work, copy this link: ${round2Link}
            </p>
          </div>
        `;

        const rawMessage = createEmail(
          candidate.email,
          `Congratulations! Round 2 Interview for ${jobTitle} at ${COMPANY_NAME}`,
          htmlBody
        );

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage },
        });

        console.log(`[Round 2 Invite] Gmail email sent to ${candidate.email}`);
      } catch (emailError) {
        console.error('[Round 2 Invite] Gmail failed:', emailError);
        return { success: false, error: 'Failed to send email via Gmail' };
      }
    } else {
      console.log(`[Round 2 Invite] No Gmail configured - would send to ${candidate.email}`);
      console.log(`[Round 2 Invite] Link: ${round2Link}`);
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

    return { success: true };
  } catch (error) {
    console.error('Invite to round 2 error:', error);
    return { success: false, error: 'Failed to invite to round 2' };
  }
}
