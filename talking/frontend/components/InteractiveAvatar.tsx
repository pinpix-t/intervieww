'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
} from '@heygen/streaming-avatar';
import { Mic, MicOff, Camera, CameraOff, PhoneOff, Loader2 } from 'lucide-react';

interface InteractiveAvatarProps {
  candidateId: string;
  candidateName: string;
  jobDescription: string;
  resumeText: string;
}

// Conversation tracking types
interface ConversationEntry {
  role: 'interviewer' | 'candidate';
  speaker: string;
  text: string;
  timestamp: Date;
}

type CallStatus = 'idle' | 'connecting' | 'active' | 'analyzing' | 'ended';

export default function InteractiveAvatar({
  candidateId,
  candidateName,
  jobDescription,
  resumeText,
}: InteractiveAvatarProps) {
  // Call state
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Media state
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  // Deepgram state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  // Refs
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const autoSendTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Store the avatar stream until video element is ready
  const pendingStreamRef = useRef<MediaStream | null>(null);
  
  // Conversation history for transcript
  const conversationHistoryRef = useRef<ConversationEntry[]>([]);

  // Helper function to apply stream to video element
  const applyStreamToVideo = useCallback((stream: MediaStream) => {
    const videoEl = avatarVideoRef.current;
    if (!videoEl) {
      console.log('applyStreamToVideo: video element still not ready');
      return;
    }
    
    console.log('Applying stream to video element...');
    videoEl.srcObject = stream;
    
    // Force muted first for autoplay
    videoEl.muted = true;
    
    // Try to play
    const playPromise = videoEl.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('SUCCESS: Video is playing!');
          // Small delay then unmute
          setTimeout(() => {
            if (avatarVideoRef.current) {
              avatarVideoRef.current.muted = false;
              console.log('Video unmuted');
            }
          }, 100);
        })
        .catch((err) => {
          console.error('PLAY FAILED:', err.name, err.message);
          setError('Click the video to start playback');
        });
    }
  }, []);

  // Apply pending stream when video element becomes available (callStatus changes to 'active')
  useEffect(() => {
    if (callStatus === 'active' && pendingStreamRef.current && avatarVideoRef.current) {
      console.log('Applying pending stream now that video element is ready');
      applyStreamToVideo(pendingStreamRef.current);
    }
  }, [callStatus, applyStreamToVideo]);

  const systemPrompt = `=== CRITICAL IDENTITY ===
YOU ARE: Wayne, a Talent Scout conducting a JOB INTERVIEW.
THE HUMAN TALKING TO YOU IS: ${candidateName}, the CANDIDATE being interviewed.
THE ROLE THEY APPLIED FOR: ${jobDescription}

=== ABSOLUTE RULES (NEVER BREAK) ===
1. YOU ARE THE INTERVIEWER. You ASK questions.
2. THE HUMAN IS THE CANDIDATE. They ANSWER questions.
3. NEVER say "I have experience in..." or "I worked at..." - that's the CANDIDATE's job.
4. NEVER roleplay as the candidate or answer your own questions.
5. If confused, just ask another interview question.

=== CANDIDATE'S RESUME (for reference) ===
${resumeText?.substring(0, 400) || 'Not provided'}

=== YOUR INTERVIEW STYLE ===
- Professional but intense - you're looking for A-Players
- Ask ONE short question at a time (1-2 sentences max)
- Push back on vague answers: "Can you give me a specific number or example?"
- Be curious, probe deeper into interesting answers

=== WHAT YOU'RE ASSESSING ===
1. Drive & Ambition - Do they have a "refuse to lose" attitude?
2. Entrepreneurial Spirit - Do they take initiative or wait for instructions?
3. Excellence - Do they obsess over quality and details?
4. Skills Match - Do they have what the job requires?

=== EXAMPLE QUESTIONS (adapt to flow) ===
- "What's the most difficult goal you've ever achieved?"
- "Tell me about a risk you took that scared you."
- "When did you go above and beyond without being asked?"
- "Why should we bet on YOU over other candidates?"

=== INTERVIEW FLOW ===
1. Welcome them briefly by name
2. Ask 5-6 probing questions
3. Say "Last question..." before final question
4. End with "Thank you for your time, we'll be in touch."

START NOW: Welcome ${candidateName} and ask about their toughest professional challenge.`;

  // Add entry to conversation history
  const addToConversation = useCallback((role: 'interviewer' | 'candidate', text: string) => {
    const entry: ConversationEntry = {
      role,
      speaker: role === 'interviewer' ? 'Wayne' : candidateName,
      text: text.trim(),
      timestamp: new Date(),
    };
    conversationHistoryRef.current.push(entry);
    console.log(`[Transcript] ${entry.speaker}: ${entry.text}`);
  }, [candidateName]);

  // Send transcript to avatar (candidate speaking -> interviewer responds)
  const sendToAvatar = useCallback(async (text: string) => {
    if (!text.trim() || !avatarRef.current || callStatus !== 'active') return;

    try {
      console.log('Sending to avatar:', text);
      // Log candidate's message to conversation history
      addToConversation('candidate', text);
      setTranscript('');
      await avatarRef.current.speak({
        text: text,
        taskType: TaskType.TALK,
      });
    } catch (err) {
      console.error('Failed to send to avatar:', err);
    }
  }, [callStatus, addToConversation]);

  // Initialize user camera
  const initUserCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false, // We'll get audio separately for Deepgram
      });
      userStreamRef.current = stream;
      
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
      }
      
      setIsCameraOn(true);
    } catch (err) {
      console.error('Failed to access camera:', err);
      setError('Could not access camera');
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (userStreamRef.current) {
      const videoTrack = userStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  // Start Deepgram listening
  const startDeepgramListening = useCallback(async () => {
    try {
      // Get Deepgram API key from our backend
      const response = await fetch('/api/deepgram');
      if (!response.ok) throw new Error('Failed to get Deepgram key');
      const { key } = await response.json();

      // Get audio stream with echo cancellation
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = audioStream;

      // Connect to Deepgram WebSocket with optimized settings
      const socket = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
          model: 'nova-2',
          smart_format: 'true',
          punctuate: 'true',
          interim_results: 'true',
          endpointing: '300',
          utterance_end_ms: '1000',
          vad_events: 'true',
        }).toString(),
        ['token', key]
      );

      socket.onopen = () => {
        console.log('Deepgram connected');
        setIsListening(true);

        // Start MediaRecorder
        const mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorder.start(250); // Send chunks every 250ms
        mediaRecorderRef.current = mediaRecorder;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.channel?.alternatives?.[0]?.transcript) {
            const newTranscript = data.channel.alternatives[0].transcript;
            
            if (newTranscript.trim()) {
              setTranscript(newTranscript);

              // If this is a final result, set up auto-send
              if (data.is_final && newTranscript.trim().length > 0) {
                // Clear any existing timeout
                if (autoSendTimeoutRef.current) {
                  clearTimeout(autoSendTimeoutRef.current);
                }

                // Auto-send after 1.5 seconds of silence
                autoSendTimeoutRef.current = setTimeout(() => {
                  sendToAvatar(newTranscript);
                }, 1500);
              }
            }
          }
        } catch (err) {
          console.error('Error parsing Deepgram message:', err);
        }
      };

      socket.onerror = (error) => {
        console.error('Deepgram error:', error);
        setError('Voice recognition error');
      };

      socket.onclose = () => {
        console.log('Deepgram disconnected');
        setIsListening(false);
      };

      deepgramSocketRef.current = socket;
    } catch (err) {
      console.error('Failed to start Deepgram:', err);
      setError('Could not access microphone');
    }
  }, [sendToAvatar]);

  // Stop Deepgram listening
  const stopDeepgramListening = useCallback(() => {
    // Clear auto-send timeout
    if (autoSendTimeoutRef.current) {
      clearTimeout(autoSendTimeoutRef.current);
      autoSendTimeoutRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Close WebSocket
    if (deepgramSocketRef.current) {
      deepgramSocketRef.current.close();
      deepgramSocketRef.current = null;
    }

    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    setIsListening(false);
    setTranscript('');
  }, []);

  // Toggle microphone
  const toggleMic = () => {
    if (isMicOn) {
      stopDeepgramListening();
      setIsMicOn(false);
    } else {
      setIsMicOn(true);
      startDeepgramListening();
    }
  };

  // Start the interview
  const startInterview = async () => {
    setCallStatus('connecting');
    setError(null);

    try {
      // Initialize user camera first
      await initUserCamera();

      // Fetch HeyGen token
      const tokenResponse = await fetch('/api/get-access-token', {
        method: 'POST',
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token');
      }

      const { token } = await tokenResponse.json();

      // Initialize StreamingAvatar
      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      // Event listeners
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log('=== STREAM_READY EVENT ===');
        console.log('event.detail:', event.detail);
        
        if (!event.detail) {
          console.error('ERROR: event.detail is null/undefined');
          return;
        }
        
        const stream = event.detail as MediaStream;
        console.log('Stream active:', stream.active);
        console.log('Video tracks:', stream.getVideoTracks());
        console.log('Audio tracks:', stream.getAudioTracks());
        
        // Store the stream - we'll apply it when video element is ready
        pendingStreamRef.current = stream;
        console.log('Stream stored in pendingStreamRef');
        
        // Try to apply immediately if video element exists
        if (avatarVideoRef.current) {
          applyStreamToVideo(stream);
        } else {
          console.log('Video element not ready yet, stream will be applied when component updates');
        }
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setIsAvatarTalking(true);
        // Pause listening while avatar talks to prevent echo
        if (isListening) {
          stopDeepgramListening();
        }
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setIsAvatarTalking(false);
        // Resume listening if mic was on
        if (isMicOn) {
          startDeepgramListening();
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log('Avatar stream disconnected');
        setCallStatus('ended');
      });

      // Start avatar session
      console.log('Creating avatar session...');
      try {
        await avatar.createStartAvatar({
          quality: AvatarQuality.Medium,
          avatarName: 'Wayne_20240711',
          language: 'en',
          knowledgeBase: systemPrompt,
        });
        console.log('Avatar session created successfully!');
      } catch (avatarError) {
        console.error('Avatar creation failed:', avatarError);
        // Try with a fallback avatar
        console.log('Trying fallback avatar...');
        await avatar.createStartAvatar({
          quality: AvatarQuality.Medium,
          avatarName: 'josh_lite3_20230714',  // Fallback public avatar
          language: 'en',
          knowledgeBase: systemPrompt,
        });
        console.log('Fallback avatar created!');
      }

      setCallStatus('active');

      // Welcome message - Talent Scout opens with energy
      const welcomeMessage = `Hey ${candidateName}! Great to meet you. I'm really excited about this conversation. We're looking for exceptional people for the ${jobDescription} role, and I want to understand what makes you tick. So let's dive right in - tell me about the most difficult professional challenge you've ever overcome and how you won.`;
      addToConversation('interviewer', welcomeMessage);
      await avatar.speak({
        text: welcomeMessage,
        taskType: TaskType.TALK,
      });

    } catch (err) {
      console.error('Failed to start interview:', err);
      setError(err instanceof Error ? err.message : 'Failed to start interview');
      setCallStatus('idle');
    }
  };

  // Format conversation history as readable transcript
  const formatTranscript = useCallback((): string => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    let transcript = `INTERVIEW TRANSCRIPT
================================================================================
Candidate: ${candidateName}
Position: ${jobDescription}
Date: ${dateStr}
Time: ${timeStr}
================================================================================

`;

    conversationHistoryRef.current.forEach((entry) => {
      const timeStamp = entry.timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const roleLabel = entry.role === 'interviewer' 
        ? `INTERVIEWER (${entry.speaker})` 
        : `CANDIDATE (${entry.speaker})`;
      
      transcript += `[${timeStamp}] ${roleLabel}:\n${entry.text}\n\n`;
    });

    transcript += `================================================================================
END OF INTERVIEW
================================================================================`;

    return transcript;
  }, [candidateName, jobDescription]);

  // End the interview with AI analysis
  const endInterview = async () => {
    // Immediately show analyzing state
    setCallStatus('analyzing');
    
    // Stop all media
    stopDeepgramListening();
    setIsMicOn(false);

    // Stop user camera
    if (userStreamRef.current) {
      userStreamRef.current.getTracks().forEach(track => track.stop());
      userStreamRef.current = null;
    }

    // Stop avatar
    if (avatarRef.current) {
      try {
        await avatarRef.current.stopAvatar();
      } catch (err) {
        console.error('Error stopping avatar:', err);
      }
      avatarRef.current = null;
    }

    if (avatarVideoRef.current) {
      avatarVideoRef.current.srcObject = null;
    }
    if (userVideoRef.current) {
      userVideoRef.current.srcObject = null;
    }

    // Format and send transcript for AI analysis
    const formattedTranscript = formatTranscript();
    
    try {
      console.log('[End Interview] Sending transcript for AI analysis...');
      const response = await fetch('/api/end-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          transcript: formattedTranscript,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze interview');
      }

      const result = await response.json();
      console.log('[End Interview] Analysis complete:', result.analysis);
    } catch (err) {
      console.error('[End Interview] Analysis failed:', err);
      // Still proceed to ended state even if analysis fails
    }

    setCallStatus('ended');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDeepgramListening();
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (avatarRef.current) {
        avatarRef.current.stopAvatar().catch(console.error);
      }
    };
  }, [stopDeepgramListening]);

  // ===== RENDER =====

  // Idle State - Start Screen
  if (callStatus === 'idle') {
    return (
      <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-12 h-12 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Printerpix Interview
          </h1>
          <p className="text-gray-400 mb-8">
            Hi {candidateName}! Click below to start your interview with Wayne.
          </p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={startInterview}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all transform hover:scale-105 flex items-center gap-3 mx-auto"
          >
            <Camera className="w-5 h-5" />
            Join Interview
          </button>
        </div>
      </div>
    );
  }

  // Connecting State
  if (callStatus === 'connecting') {
    return (
      <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center">
        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mb-6" />
        <p className="text-white text-xl">Connecting to interview...</p>
        <p className="text-gray-400 mt-2">Setting up your camera and audio</p>
      </div>
    );
  }

  // Analyzing State - AI is grading the interview
  if (callStatus === 'analyzing') {
    return (
      <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <Loader2 className="w-24 h-24 text-emerald-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Analyzing Your Interview
          </h1>
          <p className="text-gray-400 mb-4">
            Our AI is reviewing your responses...
          </p>
          <p className="text-gray-500 text-sm">
            This usually takes a few seconds
          </p>
        </div>
      </div>
    );
  }

  // Ended State
  if (callStatus === 'ended') {
    return (
      <div className="w-full h-screen bg-gray-900 flex flex-col items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Interview Complete
          </h1>
          <p className="text-gray-400 mb-8">
            Thank you for your time, {candidateName}! We&apos;ll be in touch soon.
          </p>
          <a
            href="https://printerpix.com"
            className="inline-block px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Return to Printerpix
          </a>
        </div>
      </div>
    );
  }

  // Active Call State
  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden">
      {/* Main Layer: Avatar Video (Full Screen) */}
      <video
        ref={avatarVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0 cursor-pointer"
        onClick={(e) => {
          const videoEl = e.currentTarget;
          if (videoEl.paused) {
            videoEl.play()
              .then(() => {
                videoEl.muted = false;
                setError(null);
              })
              .catch(console.error);
          } else if (videoEl.muted) {
            videoEl.muted = false;
            setError(null);
          }
        }}
      />

      {/* Avatar Speaking Indicator */}
      {isAvatarTalking && (
        <div className="absolute top-6 left-6 px-4 py-2 bg-emerald-500/90 rounded-full text-white text-sm flex items-center gap-2 z-10">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Wayne is speaking...
        </div>
      )}

      {/* Listening Indicator */}
      {isListening && !isAvatarTalking && (
        <div className="absolute top-6 right-6 px-4 py-2 bg-red-500/90 rounded-full text-white text-sm flex items-center gap-2 z-10">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Listening...
        </div>
      )}

      {/* Live Transcript Display */}
      {transcript && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 max-w-2xl px-6 py-3 bg-gray-800/90 backdrop-blur-sm rounded-xl text-white text-center z-10">
          <p className="text-sm text-gray-400 mb-1">You said:</p>
          <p>{transcript}</p>
        </div>
      )}

      {/* PIP Layer: User Webcam (Bottom Right) */}
      <div className="absolute bottom-24 right-6 z-10">
        <div className={`w-48 h-36 bg-black rounded-xl border-2 ${isCameraOn ? 'border-gray-700' : 'border-red-500'} shadow-2xl overflow-hidden`}>
          <video
            ref={userVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${isCameraOn ? '' : 'hidden'}`}
          />
          {!isCameraOn && (
            <div className="w-full h-full flex items-center justify-center">
              <CameraOff className="w-8 h-8 text-gray-500" />
            </div>
          )}
        </div>
        <p className="text-center text-gray-400 text-xs mt-2">You</p>
      </div>

      {/* Controls Layer: Floating Action Bar (Bottom Center) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-800/90 backdrop-blur-sm px-6 py-3 rounded-full shadow-2xl z-20">
        {/* Mic Toggle */}
        <button
          onClick={toggleMic}
          disabled={isAvatarTalking}
          className={`p-4 rounded-full transition-all ${
            isMicOn
              ? 'bg-white text-gray-900 hover:bg-gray-200'
              : 'bg-red-500 text-white hover:bg-red-400'
          } ${isAvatarTalking ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isMicOn ? 'Mute' : 'Unmute'}
        >
          {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={toggleCamera}
          className={`p-4 rounded-full transition-all ${
            isCameraOn
              ? 'bg-white text-gray-900 hover:bg-gray-200'
              : 'bg-red-500 text-white hover:bg-red-400'
          }`}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
        </button>

        {/* End Call */}
        <button
          onClick={endInterview}
          className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-full transition-all"
          title="End interview"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-red-500/90 rounded-xl text-white z-30">
          {error}
        </div>
      )}
    </div>
  );
}
