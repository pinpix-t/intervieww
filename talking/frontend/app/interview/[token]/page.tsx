'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import InteractiveAvatar from '@/components/InteractiveAvatar';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface CandidateData {
  id: number;
  full_name: string;
  job_description: string | null;
  resume_text: string | null;
  status: string | null;
  rating: number | null;
}

export default function InterviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCandidate = async () => {
      if (!token) {
        setError('No interview token provided');
        setIsLoading(false);
        return;
      }

      try {
        // Query by interview_token (secure, unguessable UUID)
        const { data, error: supabaseError } = await supabase
          .from('candidates')
          .select('id, full_name, job_description, resume_text, status, rating')
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
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading interview...</p>
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

  // Already Completed State - Prevent re-taking
  const isAlreadyCompleted = 
    candidate.status?.toLowerCase() === 'interviewed' || 
    candidate.rating !== null;

  if (isAlreadyCompleted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl p-10 max-w-md mx-auto text-center shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Interview Completed
          </h1>
          <p className="text-slate-400 mb-2">
            Thank you for your time, {candidate.full_name}.
          </p>
          <p className="text-slate-500 text-sm">
            Your response has been submitted to the recruiting team. We&apos;ll be in touch soon.
          </p>
        </div>
      </div>
    );
  }

  // Success - Render Interview (pass the actual candidate ID for saving)
  return (
    <InteractiveAvatar
      candidateId={String(candidate.id)}
      candidateName={candidate.full_name}
      jobDescription={candidate.job_description || 'Software Engineer at Printerpix'}
      resumeText={candidate.resume_text || 'No resume provided'}
    />
  );
}
