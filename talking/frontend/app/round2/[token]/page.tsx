'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import InteractiveAvatar from '@/components/InteractiveAvatar';
import { Loader2, AlertCircle, CheckCircle, Lock } from 'lucide-react';

interface CandidateData {
  id: number;
  full_name: string;
  job_description: string | null;
  resume_text: string | null;
  current_stage: string | null;
  round_1_dossier: string[] | null;
  round_2_rating: number | null;
}

export default function Round2Page() {
  const params = useParams();
  const token = params.token as string;

  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const fetchCandidate = async () => {
      if (!token) {
        setError('No interview token provided');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: supabaseError } = await supabase
          .from('candidates')
          .select('id, full_name, job_description, resume_text, current_stage, round_1_dossier, round_2_rating')
          .eq('interview_token', token)
          .single();

        if (supabaseError) {
          console.error('Supabase error:', supabaseError);
          setError('Interview link is invalid or expired');
          return;
        }

        if (!data) {
          setError('Candidate not found');
          return;
        }

        // Check if candidate is in Round 2 stage
        if (data.current_stage !== 'round_2') {
          setAccessDenied(true);
          return;
        }

        setCandidate(data);
      } catch (err) {
        console.error('Error fetching candidate:', err);
        setError('Failed to load interview data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCandidate();
  }, [token]);

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading technical interview...</p>
        </div>
      </div>
    );
  }

  // Access Denied - Not in Round 2 stage
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Round 2 Not Available
          </h1>
          <p className="text-slate-400 mb-6">
            You need to complete Round 1 first, or wait for HR to invite you to Round 2.
          </p>
          <a
            href="https://printerpix.com"
            className="inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Return to Printerpix
          </a>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !candidate) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Interview Link Invalid
          </h1>
          <p className="text-slate-400 mb-6">
            {error || 'This interview link is no longer valid. Please contact the recruiter for a new link.'}
          </p>
          <a
            href="https://printerpix.com"
            className="inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Return to Printerpix
          </a>
        </div>
      </div>
    );
  }

  // Already Completed Round 2 - Prevent re-taking
  if (candidate.round_2_rating !== null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl p-10 max-w-md mx-auto text-center shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            All Rounds Complete
          </h1>
          <p className="text-slate-400 mb-2">
            Thank you, {candidate.full_name}.
          </p>
          <p className="text-slate-500 text-sm">
            Both interview rounds have been completed. Our hiring team will review your performance and be in touch soon.
          </p>
        </div>
      </div>
    );
  }

  // Success - Render Round 2 Interview with Atlas persona
  return (
    <InteractiveAvatar
      candidateId={String(candidate.id)}
      candidateName={candidate.full_name}
      jobDescription={candidate.job_description || 'Software Engineer at Printerpix'}
      resumeText={candidate.resume_text || 'No resume provided'}
      round={2}
      dossier={candidate.round_1_dossier || undefined}
    />
  );
}

