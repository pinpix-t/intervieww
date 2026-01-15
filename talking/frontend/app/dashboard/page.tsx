'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Trophy, AlertCircle, Clock, Eye, X, FileText, Brain, Briefcase } from 'lucide-react';

interface Candidate {
  id: number;
  full_name: string;
  email: string;
  rating: number | null;
  ai_summary: string | null;
  status: string;
  interview_transcript: string | null;
  resume_text: string | null;
  job_id: string | null;
  job_title?: string;
}

export default function DashboardPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        // Fetch candidates
        const { data: candidatesData, error: candidatesError } = await supabase
          .from('candidates')
          .select('id, full_name, email, rating, ai_summary, status, interview_transcript, resume_text, job_id')
          .order('rating', { ascending: false, nullsFirst: false });

        if (candidatesError) {
          console.error('Error fetching candidates:', candidatesError);
          return;
        }

        // Fetch jobs
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('id, title');

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
        }

        // Create job lookup map
        const jobMap = new Map<string, string>();
        jobsData?.forEach(job => {
          jobMap.set(job.id, job.title);
        });

        // Merge job titles into candidates
        const candidatesWithJobs = (candidatesData || []).map(candidate => ({
          ...candidate,
          job_title: candidate.job_id ? jobMap.get(candidate.job_id) || 'Unknown Role' : undefined,
        }));

        setCandidates(candidatesWithJobs);
      } catch (err) {
        console.error('Failed to fetch candidates:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCandidates();
  }, []);

  // Get score badge styling
  const getScoreBadge = (rating: number | null) => {
    if (rating === null) {
      return {
        bg: 'bg-slate-700',
        text: 'text-slate-300',
        label: 'Pending',
        icon: Clock,
      };
    }
    if (rating >= 80) {
      return {
        bg: 'bg-emerald-500/20',
        text: 'text-emerald-400',
        label: `${rating}`,
        icon: Trophy,
      };
    }
    if (rating >= 50) {
      return {
        bg: 'bg-yellow-500/20',
        text: 'text-yellow-400',
        label: `${rating}`,
        icon: null,
      };
    }
    return {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      label: `${rating}`,
      icon: AlertCircle,
    };
  };

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'interviewed') {
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    }
    if (statusLower.includes('sent') || statusLower.includes('graded')) {
      return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
    }
    if (statusLower.includes('reject')) {
      return { bg: 'bg-red-500/20', text: 'text-red-400' };
    }
    return { bg: 'bg-slate-700', text: 'text-slate-300' };
  };

  // Truncate text
  const truncate = (text: string | null, maxLength: number) => {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-500/20 rounded-xl">
            <Trophy className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Candidate Leaderboard</h1>
            <p className="text-slate-400">AI-ranked candidates by interview performance</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Total Candidates</p>
            <p className="text-2xl font-bold text-white">{candidates.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Interviewed</p>
            <p className="text-2xl font-bold text-emerald-400">
              {candidates.filter(c => c.rating !== null).length}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Top Performers (80+)</p>
            <p className="text-2xl font-bold text-yellow-400">
              {candidates.filter(c => c.rating !== null && c.rating >= 80).length}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Pending Interview</p>
            <p className="text-2xl font-bold text-slate-400">
              {candidates.filter(c => c.rating === null).length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 font-medium p-4">Rank</th>
                <th className="text-left text-slate-400 font-medium p-4">Name</th>
                <th className="text-left text-slate-400 font-medium p-4">Role</th>
                <th className="text-left text-slate-400 font-medium p-4">Score</th>
                <th className="text-left text-slate-400 font-medium p-4">AI Summary</th>
                <th className="text-left text-slate-400 font-medium p-4">Status</th>
                <th className="text-left text-slate-400 font-medium p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate, index) => {
                const scoreBadge = getScoreBadge(candidate.rating);
                const statusBadge = getStatusBadge(candidate.status);
                const ScoreIcon = scoreBadge.icon;

                return (
                  <tr 
                    key={candidate.id} 
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    {/* Rank */}
                    <td className="p-4">
                      <span className={`text-lg font-bold ${
                        index === 0 && candidate.rating ? 'text-yellow-400' :
                        index === 1 && candidate.rating ? 'text-slate-300' :
                        index === 2 && candidate.rating ? 'text-amber-600' :
                        'text-slate-500'
                      }`}>
                        #{index + 1}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="p-4">
                      <div>
                        <p className="text-white font-medium">{candidate.full_name}</p>
                        <p className="text-slate-500 text-sm">{candidate.email}</p>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="p-4">
                      <span className="text-slate-300">
                        {candidate.job_title || 'Not specified'}
                      </span>
                    </td>

                    {/* Score */}
                    <td className="p-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${scoreBadge.bg}`}>
                        {ScoreIcon && <ScoreIcon className={`w-4 h-4 ${scoreBadge.text}`} />}
                        <span className={`font-semibold ${scoreBadge.text}`}>
                          {scoreBadge.label}
                        </span>
                      </div>
                    </td>

                    {/* AI Summary */}
                    <td className="p-4 max-w-xs">
                      <p className="text-slate-400 text-sm">
                        {truncate(candidate.ai_summary, 100)}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-sm ${statusBadge.bg} ${statusBadge.text}`}>
                        {candidate.status || 'Unknown'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedCandidate(candidate)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {candidates.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              No candidates found. Start processing applications!
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <span className="text-emerald-400 font-bold text-lg">
                    {selectedCandidate.full_name.charAt(0)}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedCandidate.full_name}</h2>
                  <p className="text-slate-400">{selectedCandidate.job_title || 'No role specified'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Score Card */}
              <div className="flex items-center gap-6 mb-6">
                {(() => {
                  const badge = getScoreBadge(selectedCandidate.rating);
                  const Icon = badge.icon;
                  return (
                    <div className={`flex items-center gap-3 px-6 py-4 rounded-xl ${badge.bg}`}>
                      {Icon && <Icon className={`w-8 h-8 ${badge.text}`} />}
                      <div>
                        <p className="text-slate-400 text-sm">Interview Score</p>
                        <p className={`text-3xl font-bold ${badge.text}`}>
                          {selectedCandidate.rating !== null ? `${selectedCandidate.rating}/100` : 'Pending'}
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex-1">
                  <p className="text-slate-400 text-sm mb-1">Status</p>
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusBadge(selectedCandidate.status).bg} ${getStatusBadge(selectedCandidate.status).text}`}>
                    {selectedCandidate.status}
                  </span>
                </div>
              </div>

              {/* AI Summary */}
              {selectedCandidate.ai_summary && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-white">AI Summary</h3>
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4">
                    <p className="text-slate-300">{selectedCandidate.ai_summary}</p>
                  </div>
                </div>
              )}

              {/* Interview Transcript */}
              {selectedCandidate.interview_transcript && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Interview Transcript</h3>
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto">
                    <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
                      {selectedCandidate.interview_transcript}
                    </pre>
                  </div>
                </div>
              )}

              {/* Resume */}
              {selectedCandidate.resume_text && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-semibold text-white">Resume Summary</h3>
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-48 overflow-y-auto">
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">
                      {selectedCandidate.resume_text}
                    </p>
                  </div>
                </div>
              )}

              {/* No data state */}
              {!selectedCandidate.ai_summary && !selectedCandidate.interview_transcript && (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400">Interview not completed yet</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Data will appear after the candidate completes their AI interview
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
              {selectedCandidate.rating !== null && selectedCandidate.rating >= 70 && (
                <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
                  Schedule Final Interview
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

