'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { screenResume } from '@/app/actions/bulkScreen';
import { Upload, FileText, CheckCircle, XCircle, Loader2, ArrowLeft, Zap } from 'lucide-react';
import Link from 'next/link';

interface Job {
  id: string;
  title: string;
}

interface ScreeningResult {
  fileName: string;
  name?: string;
  email?: string;
  score?: number;
  reasoning?: string;
  status?: 'RECOMMENDED' | 'REJECT';
  processing: boolean;
  error?: string;
  skipped?: boolean;
}

export default function ScreenerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Fetch jobs on mount
  useEffect(() => {
    const fetchJobs = async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('is_active', true);

      if (!error && data) {
        setJobs(data);
        if (data.length > 0) {
          setSelectedJobId(data[0].id);
        }
      }
    };
    fetchJobs();
  }, []);

  // Handle file processing
  const processFiles = useCallback(async (files: FileList) => {
    if (!selectedJobId) {
      alert('Please select a job first');
      return;
    }

    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      alert('No PDF files found. Please upload PDF resumes only.');
      return;
    }

    setIsProcessing(true);

    // Initialize results with processing state
    const initialResults: ScreeningResult[] = pdfFiles.map(f => ({
      fileName: f.name,
      processing: true,
    }));
    setResults(initialResults);

    // Process each file
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const result = await screenResume(selectedJobId, formData);

        setResults(prev => prev.map((r, idx) => 
          idx === i ? {
            ...r,
            processing: false,
            name: result.name,
            email: result.email,
            score: result.score,
            reasoning: result.reasoning,
            status: result.status,
            error: result.error,
            skipped: result.skipped,
          } : r
        ));
      } catch (error) {
        setResults(prev => prev.map((r, idx) => 
          idx === i ? {
            ...r,
            processing: false,
            error: 'Failed to process',
          } : r
        ));
      }
    }

    setIsProcessing(false);
  }, [selectedJobId]);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Sort results by score (high to low)
  const sortedResults = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Stats
  const processed = results.filter(r => !r.processing);
  const recommended = processed.filter(r => r.status === 'RECOMMENDED');
  const rejected = processed.filter(r => r.status === 'REJECT');

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard"
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Zap className="w-6 h-6 text-yellow-500" />
                  The War Room
                </h1>
                <p className="text-slate-400 text-sm">Bulk AI Resume Screening</p>
              </div>
            </div>
            
            {/* Stats */}
            {processed.length > 0 && (
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{processed.length}</p>
                  <p className="text-slate-400">Processed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{recommended.length}</p>
                  <p className="text-slate-400">Recommended</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{rejected.length}</p>
                  <p className="text-slate-400">Rejected</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Step 1: Job Selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Step 1: Select Job Position
          </label>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full max-w-md px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {jobs.length === 0 && (
              <option value="">No active jobs found</option>
            )}
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Upload Zone */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Step 2: Upload Resumes
          </label>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
              dragActive 
                ? 'border-yellow-500 bg-yellow-500/10' 
                : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-yellow-500' : 'text-slate-500'}`} />
            <p className="text-lg font-medium text-slate-300">
              {isProcessing ? 'Processing...' : 'Drop PDF resumes here or click to upload'}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Supports multiple files • PDF only
            </p>
          </div>
        </div>

        {/* Step 3: Live Leaderboard */}
        {results.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-300 mb-4">
              Step 3: Live Leaderboard
            </h2>
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="text-left text-slate-400 font-medium px-4 py-3">File</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Name</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Email</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Score</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Status</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result, idx) => (
                    <tr 
                      key={idx} 
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      {/* File */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-400 text-sm truncate max-w-[150px]">
                            {result.fileName}
                          </span>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        {result.processing ? (
                          <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                        ) : (
                          <span className="text-white">{result.name || '—'}</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <span className="text-slate-400 text-sm">{result.email || '—'}</span>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        {result.processing ? (
                          <span className="text-slate-500">...</span>
                        ) : result.score !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  result.score >= 70 ? 'bg-emerald-500' : 
                                  result.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${result.score}%` }}
                              />
                            </div>
                            <span className={`font-semibold ${
                              result.score >= 70 ? 'text-emerald-400' : 
                              result.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {result.score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-red-400">Error</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {result.processing ? (
                          <span className="text-slate-500">Processing...</span>
                        ) : result.skipped ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 rounded-full text-xs">
                            Duplicate
                          </span>
                        ) : result.status === 'RECOMMENDED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs">
                            <CheckCircle className="w-3 h-3" />
                            Interview
                          </span>
                        ) : result.status === 'REJECT' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        ) : (
                          <span className="text-red-400 text-xs">{result.error || 'Error'}</span>
                        )}
                      </td>

                      {/* Reasoning */}
                      <td className="px-4 py-3">
                        <span className="text-slate-400 text-sm">
                          {result.reasoning || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

