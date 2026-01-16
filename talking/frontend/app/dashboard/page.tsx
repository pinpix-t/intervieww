'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { sendInterviewInvite, inviteToRound2 } from '@/app/actions/sendInvite';
import { Trophy, AlertCircle, Clock, Eye, X, FileText, Brain, Briefcase, Send, ArrowRight, Filter, Zap } from 'lucide-react';
import Link from 'next/link';

interface Candidate {
  id: number;
  full_name: string;
  email: string;
  rating: number | null;
  round_2_rating: number | null;
  ai_summary: string | null;
  status: string;
  current_stage: string | null;
  interview_transcript: string | null;
  round_2_transcript: string | null;
  resume_text: string | null;
  job_id: string | null;
  job_title?: string;
  final_verdict: string | null;
  interview_token: string | null;
}

interface Job {
  id: string;
  title: string;
}

export default function DashboardPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  
  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  
  // Action states
  const [sendingInvite, setSendingInvite] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch candidates with all round data
        const { data: candidatesData, error: candidatesError } = await supabase
          .from('candidates')
          .select('id, full_name, email, rating, round_2_rating, ai_summary, status, current_stage, interview_transcript, round_2_transcript, resume_text, job_id, final_verdict, interview_token')
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

        setJobs(jobsData || []);

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
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter candidates
  const filteredCandidates = candidates.filter(c => {
    if (roleFilter !== 'all' && c.job_id !== roleFilter) return false;
    if (stageFilter !== 'all') {
      const stage = c.current_stage || 'round_1';
      if (stageFilter === 'round_1' && stage !== 'round_1') return false;
      if (stageFilter === 'round_2' && stage !== 'round_2') return false;
      if (stageFilter === 'completed' && stage !== 'completed') return false;
      if (stageFilter === 'not_interviewed' && c.rating !== null) return false;
    }
    return true;
  });

  // Get stage display
  const getStageDisplay = (candidate: Candidate) => {
    const stage = candidate.current_stage || 'round_1';
    if (stage === 'completed') {
      return { label: 'Completed', bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    }
    if (stage === 'round_2') {
      return { label: 'Round 2', bg: 'bg-blue-500/20', text: 'text-blue-400' };
    }
    if (candidate.rating !== null) {
      return { label: 'R1 Done', bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
    }
    return { label: 'Pending', bg: 'bg-slate-700', text: 'text-slate-400' };
  };

  // Score bar component
  const ScoreBar = ({ score, label, color }: { score: number | null, label: string, color: string }) => {
    if (score === null) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-12">{label}</span>
          <div className="w-16 h-2 bg-slate-700 rounded-full" />
          <span className="text-xs text-slate-500">—</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-12">{label}</span>
        <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${color}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${score >= 70 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
          {score}
        </span>
      </div>
    );
  };

  // Handle send invite
  const handleSendInvite = async (candidateId: number) => {
    setSendingInvite(candidateId);
    const result = await sendInterviewInvite(candidateId);
    if (result.success) {
      // Update local state
      setCandidates(prev => prev.map(c => 
        c.id === candidateId ? { ...c, status: 'INVITE_SENT' } : c
      ));
    } else {
      alert(result.error || 'Failed to send invite');
    }
    setSendingInvite(null);
  };

  // Handle invite to round 2
  const handleInviteRound2 = async (candidateId: number) => {
    setSendingInvite(candidateId);
    const result = await inviteToRound2(candidateId);
    if (result.success) {
      setCandidates(prev => prev.map(c => 
        c.id === candidateId ? { ...c, current_stage: 'round_2', status: 'ROUND_2_INVITED' } : c
      ));
    } else {
      alert(result.error || 'Failed to invite to round 2');
    }
    setSendingInvite(null);
  };

  // Stats
  const stats = {
    total: candidates.length,
    round1Done: candidates.filter(c => c.rating !== null && (c.current_stage === 'round_1' || !c.current_stage)).length,
    round2Done: candidates.filter(c => c.current_stage === 'round_2' || c.current_stage === 'completed').length,
    completed: candidates.filter(c => c.current_stage === 'completed').length,
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <Trophy className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Talent Pipeline</h1>
              <p className="text-slate-400">2-Round AI Interview Leaderboard</p>
            </div>
          </div>
          <Link
            href="/screener"
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors"
          >
            <Zap className="w-4 h-4" />
            Bulk Screener
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Total Candidates</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Round 1 Complete</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.round1Done}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">In Round 2</p>
            <p className="text-2xl font-bold text-blue-400">{stats.round2Done}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Fully Completed</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm">Filters:</span>
          </div>
          
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Roles</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Stages</option>
            <option value="not_interviewed">Not Interviewed</option>
            <option value="round_1">Round 1 Done</option>
            <option value="round_2">In Round 2</option>
            <option value="completed">Completed</option>
          </select>

          <span className="text-slate-500 text-sm">
            Showing {filteredCandidates.length} of {candidates.length}
          </span>
        </div>

        {/* Table */}
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 font-medium p-4">#</th>
                <th className="text-left text-slate-400 font-medium p-4">Name</th>
                <th className="text-left text-slate-400 font-medium p-4">Role</th>
                <th className="text-left text-slate-400 font-medium p-4">Stage</th>
                <th className="text-left text-slate-400 font-medium p-4">Scores</th>
                <th className="text-left text-slate-400 font-medium p-4">Verdict</th>
                <th className="text-left text-slate-400 font-medium p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate, index) => {
                const stageDisplay = getStageDisplay(candidate);
                const canSendInvite = !candidate.rating && candidate.status !== 'INVITE_SENT';
                const canInviteR2 = candidate.rating !== null && candidate.rating >= 70 && candidate.current_stage !== 'round_2' && candidate.current_stage !== 'completed';

                return (
                  <tr 
                    key={candidate.id} 
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    {/* Rank */}
                    <td className="p-4">
                      <span className="text-slate-500 font-medium">
                        {index + 1}
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
                      <span className="text-slate-300 text-sm">
                        {candidate.job_title || '—'}
                      </span>
                    </td>

                    {/* Stage */}
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${stageDisplay.bg} ${stageDisplay.text}`}>
                        {stageDisplay.label}
                      </span>
                    </td>

                    {/* Scores */}
                    <td className="p-4">
                      <div className="space-y-1">
                        <ScoreBar 
                          score={candidate.rating} 
                          label="Hunger" 
                          color={candidate.rating && candidate.rating >= 70 ? 'bg-emerald-500' : candidate.rating && candidate.rating >= 50 ? 'bg-yellow-500' : 'bg-red-500'}
                        />
                        <ScoreBar 
                          score={candidate.round_2_rating} 
                          label="Skills" 
                          color={candidate.round_2_rating && candidate.round_2_rating >= 70 ? 'bg-blue-500' : candidate.round_2_rating && candidate.round_2_rating >= 50 ? 'bg-yellow-500' : 'bg-red-500'}
                        />
                      </div>
                    </td>

                    {/* Verdict */}
                    <td className="p-4">
                      {candidate.final_verdict ? (
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          candidate.final_verdict.includes('Strong') ? 'bg-emerald-500/20 text-emerald-400' :
                          candidate.final_verdict === 'Hire' ? 'bg-blue-500/20 text-blue-400' :
                          candidate.final_verdict.includes('Weak') ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {candidate.final_verdict}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-sm">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedCandidate(candidate)}
                          className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canSendInvite && (
                          <button
                            onClick={() => handleSendInvite(candidate.id)}
                            disabled={sendingInvite === candidate.id}
                            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            title="Send Interview Invite"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}

                        {canInviteR2 && (
                          <button
                            onClick={() => handleInviteRound2(candidate.id)}
                            disabled={sendingInvite === candidate.id}
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            title="Invite to Round 2"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredCandidates.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              No candidates found matching your filters.
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
              {/* Scores */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900 rounded-xl p-4">
                  <p className="text-slate-400 text-sm mb-1">Round 1: Hunger</p>
                  <p className={`text-3xl font-bold ${
                    selectedCandidate.rating && selectedCandidate.rating >= 70 ? 'text-emerald-400' : 
                    selectedCandidate.rating ? 'text-yellow-400' : 'text-slate-500'
                  }`}>
                    {selectedCandidate.rating !== null ? `${selectedCandidate.rating}/100` : 'Pending'}
                  </p>
                </div>
                <div className="bg-slate-900 rounded-xl p-4">
                  <p className="text-slate-400 text-sm mb-1">Round 2: Skills</p>
                  <p className={`text-3xl font-bold ${
                    selectedCandidate.round_2_rating && selectedCandidate.round_2_rating >= 70 ? 'text-blue-400' : 
                    selectedCandidate.round_2_rating ? 'text-yellow-400' : 'text-slate-500'
                  }`}>
                    {selectedCandidate.round_2_rating !== null ? `${selectedCandidate.round_2_rating}/100` : 'Pending'}
                  </p>
                </div>
              </div>

              {/* Final Verdict */}
              {selectedCandidate.final_verdict && (
                <div className="mb-6 p-4 bg-slate-900 rounded-xl">
                  <p className="text-slate-400 text-sm mb-1">Final Verdict</p>
                  <p className={`text-2xl font-bold ${
                    selectedCandidate.final_verdict.includes('Strong') ? 'text-emerald-400' :
                    selectedCandidate.final_verdict === 'Hire' ? 'text-blue-400' :
                    'text-yellow-400'
                  }`}>
                    {selectedCandidate.final_verdict}
                  </p>
                </div>
              )}

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

              {/* Round 1 Transcript */}
              {selectedCandidate.interview_transcript && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-yellow-400" />
                    <h3 className="text-lg font-semibold text-white">Round 1 Transcript</h3>
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-48 overflow-y-auto">
                    <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
                      {selectedCandidate.interview_transcript}
                    </pre>
                  </div>
                </div>
              )}

              {/* Round 2 Transcript */}
              {selectedCandidate.round_2_transcript && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Round 2 Transcript</h3>
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-48 overflow-y-auto">
                    <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
                      {selectedCandidate.round_2_transcript}
                    </pre>
                  </div>
                </div>
              )}

              {/* Resume */}
              {selectedCandidate.resume_text && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-semibold text-white">Resume</h3>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
