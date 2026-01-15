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
  // Required fields
  const [title, setTitle] = useState('');
  const [salary, setSalary] = useState('');
  const [location, setLocation] = useState('');
  
  // Optional fields
  const [experienceLevel, setExperienceLevel] = useState('');
  const [keySkills, setKeySkills] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [mustHave, setMustHave] = useState('');
  const [niceToHave, setNiceToHave] = useState('');
  const [companyPerks, setCompanyPerks] = useState('');
  
  // UI state
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleGenerate = async () => {
    if (!title || !salary || !location) {
      setMessage({ type: 'error', text: 'Please fill in Job Title, Salary, and Location' });
      return;
    }

    setIsGenerating(true);
    setMessage(null);

    try {
      const result = await generateJobDescription({
        title,
        salary,
        location,
        experienceLevel: experienceLevel || undefined,
        keySkills: keySkills || undefined,
        employmentType: employmentType || undefined,
        mustHave: mustHave || undefined,
        niceToHave: niceToHave || undefined,
        companyPerks: companyPerks || undefined,
      });
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

      setMessage({ type: 'success', text: 'Job posted successfully!' });
      
      // Clear form after 2 seconds
      setTimeout(() => {
        setTitle('');
        setSalary('');
        setLocation('');
        setExperienceLevel('');
        setKeySkills('');
        setEmploymentType('');
        setMustHave('');
        setNiceToHave('');
        setCompanyPerks('');
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
      <div className="max-w-7xl mx-auto mb-8">
        <Link 
          href="/dashboard" 
          className="inline-flex items-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        
        <h1 className="text-3xl font-bold mt-4 text-white">
          AI Job Generator
        </h1>
        <p className="text-slate-400 mt-2">
          Create professional job descriptions with AI assistance
        </p>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`max-w-7xl mx-auto mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/50 border border-green-700 text-green-300' 
            : 'bg-red-900/50 border border-red-700 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Inputs */}
        <div className="space-y-6">
          {/* Required Fields Card */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-lg font-semibold mb-5 flex items-center text-white">
              <span className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
              Core Details
              <span className="text-red-400 text-sm ml-2">*required</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Job Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Senior Software Engineer"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Salary Range
                  </label>
                  <input
                    type="text"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g., AED 25,000/month"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Dubai, UAE"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Optional Fields Card */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-lg font-semibold mb-5 flex items-center text-white">
              <span className="w-7 h-7 bg-slate-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
              Additional Context
              <span className="text-slate-500 text-sm ml-2">(optional)</span>
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Experience Level
                  </label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  >
                    <option value="">Select level...</option>
                    <option value="Entry Level / Junior">Entry Level / Junior</option>
                    <option value="Mid Level">Mid Level</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead / Principal">Lead / Principal</option>
                    <option value="Manager">Manager</option>
                    <option value="Director">Director</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Employment Type
                  </label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  >
                    <option value="">Select type...</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Freelance">Freelance</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Key Skills
                </label>
                <input
                  type="text"
                  value={keySkills}
                  onChange={(e) => setKeySkills(e.target.value)}
                  placeholder="e.g., Python, AWS, SQL, React"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Must-Have Requirements
                </label>
                <textarea
                  value={mustHave}
                  onChange={(e) => setMustHave(e.target.value)}
                  placeholder="e.g., 5+ years experience, degree in CS, etc."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Nice-to-Have
                </label>
                <textarea
                  value={niceToHave}
                  onChange={(e) => setNiceToHave(e.target.value)}
                  placeholder="e.g., Experience with Kubernetes, startup background"
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Company Perks
                </label>
                <input
                  type="text"
                  value={companyPerks}
                  onChange={(e) => setCompanyPerks(e.target.value)}
                  placeholder="e.g., Remote work, equity, unlimited PTO, health insurance"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center"
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
              <>Generate Description</>
            )}
          </button>
        </div>

        {/* Right Column - Preview & Save */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 h-fit lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold mb-5 flex items-center text-white">
            <span className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center mr-3 text-sm">3</span>
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
                rows={20}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-slate-500 resize-none font-mono text-sm"
              />
            </div>

            <button
              onClick={handlePublish}
              disabled={isPublishing || !description}
              className="w-full py-3 px-6 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center"
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
                <>Publish Job</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
