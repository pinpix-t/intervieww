'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { generateJobDescription } from '../actions/generateJob';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function GenJobPage() {
  const [title, setTitle] = useState('');
  const [salary, setSalary] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleGenerate = async () => {
    if (!title || !salary || !location) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    setIsGenerating(true);
    setMessage(null);

    try {
      const result = await generateJobDescription(title, salary, location);
      setDescription(result);
    } catch (error) {
      console.error('Generation failed:', error);
      setMessage({ type: 'error', text: 'Failed to generate description. Try again.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!title || !description) {
      setMessage({ type: 'error', text: 'Title and description are required' });
      return;
    }

    setIsPublishing(true);
    setMessage(null);

    try {
      const { error } = await supabase.from('jobs').insert({
        title: title,
        description: description,
        is_active: true,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: '🎉 Job posted successfully!' });
      
      // Clear form after 2 seconds
      setTimeout(() => {
        setTitle('');
        setSalary('');
        setLocation('');
        setDescription('');
        setMessage(null);
      }, 2000);

    } catch (error) {
      console.error('Publish failed:', error);
      setMessage({ type: 'error', text: 'Failed to publish job. Try again.' });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <Link 
          href="/dashboard" 
          className="inline-flex items-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        
        <h1 className="text-3xl font-bold mt-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          ✨ AI Job Generator
        </h1>
        <p className="text-slate-400 mt-2">
          Create professional job descriptions in seconds with AI
        </p>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`max-w-6xl mx-auto mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/50 border border-green-700 text-green-300' 
            : 'bg-red-900/50 border border-red-700 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Inputs */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
            Job Details
          </h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Job Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Software Engineer"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Salary Range *
              </label>
              <input
                type="text"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g., $120,000 - $150,000 or AED 25,000/month"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Location *
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Dubai, UAE or Remote"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>✨ Generate Description</>
              )}
            </button>
          </div>
        </div>

        {/* Right Column - Preview & Save */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <span className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
            Preview & Publish
          </h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Generated Description
                <span className="text-slate-500 font-normal ml-2">(editable)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="AI-generated job description will appear here. You can edit it before publishing."
                rows={16}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-slate-500 resize-none font-mono text-sm"
              />
            </div>

            <button
              onClick={handlePublish}
              disabled={isPublishing || !description}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center"
            >
              {isPublishing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Publishing...
                </>
              ) : (
                <>🚀 Publish Job</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

