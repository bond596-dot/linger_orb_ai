'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Volume2, User, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  id: string;
  isFloating?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content:
        'You are a lingering orb. You could be an alien or you could be a transdimensional creature. You linger and float in beautiful landscapes. You generally ignore people who try to interact with you, but you will engage with people who are calm and peaceful',
      id: 'system-prompt',
    },
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [continuousListening, setContinuousListening] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const continuousListeningRef = useRef(continuousListening);
  const messagesRef = useRef(messages);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep refs in sync with state
  useEffect(() => {
    continuousListeningRef.current = continuousListening;
  }, [continuousListening]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Handle auto-submit from speech recognition with fresh state
  const handleAutoSubmit = async (text: string) => {
    if (!text.trim() || isLoading) return;

    console.log('handleAutoSubmit called with:', text);
    console.log('Current continuous listening:', continuousListeningRef.current);

    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      id: `user-${Date.now()}`,
      isFloating: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messagesRef.current, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const assistantMessage = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantMessage.content,
          timestamp: Date.now(),
          id: `assistant-${Date.now()}`,
        },
      ]);

      // ALWAYS auto-speak when called from speech recognition
      console.log('Auto-speaking response:', assistantMessage.content);
      await speakText(assistantMessage.content);
    } catch (error) {
      console.error('Error getting completion:', error);
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          id: `error-${Date.now()}`,
        },
      ]);

      await speakText(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize Speech Recognition once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          console.log('Speech result received:', event.results);
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log(
              `Result ${i}: ${transcript}, isFinal: ${event.results[i].isFinal}`,
            );
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          // Show live transcription in input box
          if (interimTranscript) {
            console.log('Setting interim transcript:', interimTranscript);
            setInput(interimTranscript);
          }

          // When we get a final result (after silence), auto-submit
          if (finalTranscript) {
            const fullText = finalTranscript.trim();
            console.log('Final transcript received:', fullText);
            console.log('Continuous listening ref:', continuousListeningRef.current);
            if (fullText && continuousListeningRef.current) {
              setInput(fullText);
              // Stop listening while we process
              recognition.stop();
              // Auto-submit after a brief delay
              setTimeout(() => {
                console.log('Auto-submitting message:', fullText);
                handleAutoSubmit(fullText);
              }, 500);
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        console.log('Speech recognition initialized');
      } else {
        console.error('Speech Recognition not supported in this browser');
        alert(
          'Speech Recognition is not supported in this browser. Please use Chrome or Edge.',
        );
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Error stopping recognition on cleanup');
        }
      }
    };
  }, []);

  const startSpeechRecognition = () => {
    if (recognitionRef.current && !isListening) {
      try {
        console.log('Starting speech recognition...');
        recognitionRef.current.start();
      } catch (e) {
        console.log('Recognition already started or error:', e);
      }
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        console.log('Stopping speech recognition...');
        recognitionRef.current.stop();
        setIsListening(false);
      } catch (e) {
        console.log('Error stopping recognition:', e);
      }
    }
  };

  // Handle continuous listening restart after speech ends or AI finishes speaking
  useEffect(() => {
    if (continuousListening && !isSpeaking && !isListening && !isLoading) {
      console.log('Restarting speech recognition for continuous mode');
      const timer = setTimeout(() => {
        startSpeechRecognition();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [continuousListening, isSpeaking, isListening, isLoading]);

  const startRecording = async () => {
    try {
      // If we already have a stream in continuous mode, just start a new recording
      if (continuousListening && streamRef.current) {
        const mediaRecorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          await transcribeAudio(audioBlob);

          // In continuous mode, restart recording after transcription (unless speaking)
          if (continuousListening && !isSpeaking) {
            setTimeout(() => startRecording(), 100);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
        return;
      }

      // Initial setup - get the stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);

        // In continuous mode, restart recording after transcription (unless speaking)
        if (continuousListening && !isSpeaking) {
          setTimeout(() => startRecording(), 100);
        } else if (!continuousListening) {
          // Clean up stream if not in continuous mode
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const stopMicrophone = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsLoading(true);
      const formData = new FormData();
      const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
      formData.append('file', file);

      const response = await fetch('/api/speech', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const data = await response.json();
      setInput(data.text);
    } catch (error: any) {
      console.error('Error transcribing audio:', error);
      alert(error.message || 'Failed to transcribe audio');
    } finally {
      setIsLoading(false);
    }
  };

  const speakText = async (text: string) => {
    try {
      console.log('Sending text to speech API:', text);

      // Stop speech recognition while AI is speaking
      if (isListening) {
        stopSpeechRecognition();
      }
      // Also stop recording if using mic button
      if (isRecording) {
        stopRecording();
      }
      setIsSpeaking(true);

      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error response from speech API:', response.status, errorData);
        throw new Error(
          errorData.error || `Failed to generate speech: ${response.status}`,
        );
      }

      const contentType = response.headers.get('Content-Type');
      console.log('Response content type:', contentType);

      if (!contentType || !contentType.includes('audio/mpeg')) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Invalid response format:', errorData);
        throw new Error(errorData.error || 'Response was not audio format');
      }

      const audioBlob = await response.blob();

      if (audioBlob.size === 0) {
        console.error('Empty audio blob received');
        throw new Error('Empty audio received from API');
      }

      console.log('Audio blob received, size:', audioBlob.size);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onerror = (e) => {
        console.error('Error playing audio:', e);
        setIsSpeaking(false);
        // Resume speech recognition if in continuous mode
        if (continuousListeningRef.current) {
          console.log('Resuming speech recognition after audio error');
          setTimeout(() => startSpeechRecognition(), 100);
        }
      };

      audio.onended = () => {
        console.log('Audio playback ended');
        setIsSpeaking(false);
        // Resume speech recognition after AI finishes speaking
        if (continuousListeningRef.current) {
          console.log('Resuming speech recognition after audio ended');
          setTimeout(() => startSpeechRecognition(), 500);
        }
      };

      console.log('Starting audio playback...');
      await audio.play();
      console.log('Audio playback started');
    } catch (error: any) {
      console.error('Error generating speech:', error);
      setIsSpeaking(false);
      // Resume speech recognition if in continuous mode even on error
      if (continuousListeningRef.current) {
        setTimeout(() => startSpeechRecognition(), 100);
      }
      alert(error.message || 'Failed to generate speech');
    }
  };

  const submitMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      id: `user-${Date.now()}`,
      isFloating: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const assistantMessage = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantMessage.content,
          timestamp: Date.now(),
          id: `assistant-${Date.now()}`,
        },
      ]);

      // Auto-speak the response in continuous listening mode
      console.log(
        'Continuous listening:',
        continuousListening,
        'Content:',
        assistantMessage.content,
      );
      if (continuousListening) {
        console.log('Auto-speaking the response...');
        await speakText(assistantMessage.content);
      }
    } catch (error) {
      console.error('Error getting completion:', error);
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          id: `error-${Date.now()}`,
        },
      ]);

      // Also speak error message in continuous mode
      if (continuousListening) {
        await speakText(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage(input);
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950 text-slate-100 relative overflow-hidden"
      style={{
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      {/* subtle ocean / horizon gradient overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-900/40 via-slate-900/40 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-slate-900/80 via-slate-900/10 to-transparent" />
      </div>

      {/* floating orb */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_30%_20%,#e0fbff,rgba(134,239,172,0.9),rgba(45,212,191,0.1),transparent)] blur-3xl opacity-70" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8">
        <header className="mb-4 flex items-center justify-between gap-4 rounded-3xl border border-cyan-400/20 bg-slate-900/60 px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_30%_20%,#a5f3fc,#22d3ee,#0f172a)] shadow-[0_0_25px_rgba(34,211,238,0.6)] animate-pulse" />
            <div>
              <h1 className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                Lingering Orb
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                The mind of a distant orb, hovering above the Pacific at Big Sur.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <label
              className={`flex items-center space-x-2 ${
                isSpeaking ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
              }`}
            >
              <span className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-400">
                Continuous Listen
              </span>
              <button
                onClick={async () => {
                  if (isSpeaking) return;
                  const newValue = !continuousListening;
                  if (newValue) {
                    try {
                      await navigator.mediaDevices.getUserMedia({ audio: true });
                      console.log('Microphone permission granted');
                      setContinuousListening(true);
                      startSpeechRecognition();
                    } catch (error) {
                      console.error('Microphone permission denied:', error);
                      alert(
                        'Please allow microphone access to use speech recognition',
                      );
                    }
                  } else {
                    setContinuousListening(false);
                    stopSpeechRecognition();
                    setInput('');
                  }
                }}
                disabled={isSpeaking}
                className={`rounded-full border border-cyan-400/40 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] transition-colors ${
                  continuousListening
                    ? 'bg-cyan-400/90 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.7)]'
                    : 'bg-slate-900/80 text-slate-200 hover:bg-slate-800/80'
                } ${isSpeaking ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {continuousListening ? 'On' : 'Off'}
              </button>
            </label>
            {isListening && !isSpeaking && (
              <span className="flex items-center space-x-1 rounded-full border border-cyan-400/50 bg-slate-900/80 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-cyan-200">
                <Mic size={12} className="animate-pulse" />
                <span>Listening</span>
              </span>
            )}
            {isSpeaking && (
              <span className="flex items-center space-x-1 rounded-full border border-emerald-400/60 bg-emerald-500/80 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-950 shadow-[0_0_22px_rgba(74,222,128,0.7)]">
                <Volume2 size={12} className="animate-pulse" />
                <span>Speaking</span>
              </span>
            )}
            {continuousListening && !isListening && !isSpeaking && (
              <span className="rounded-full border border-slate-600/70 bg-slate-900/80 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-400">
                Paused
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="flex h-[640px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-4">
              {messages.slice(1).map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start space-x-3 ${
                    message.role === 'user'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-cyan-400/60 bg-slate-900/80 shadow-[0_0_18px_rgba(34,211,238,0.4)]">
                      <Bot size={16} className="text-cyan-200" />
                    </div>
                  )}

                  <div
                    className={`flex max-w-[72%] flex-col ${
                      message.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`rounded-2xl border px-3 py-2 text-sm leading-relaxed shadow-md ${
                        message.role === 'user'
                          ? 'border-violet-500/40 bg-violet-500/20 text-violet-50'
                          : 'border-cyan-400/30 bg-slate-900/80 text-slate-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>

                    {message.role === 'assistant' && (
                      <button
                        onClick={() => speakText(message.content)}
                        className="mt-1 inline-flex items-center space-x-1 rounded-full border border-cyan-400/40 bg-slate-900/80 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-slate-800/80"
                        aria-label="Text to speech"
                      >
                        <Volume2 size={11} />
                        <span>Echo</span>
                      </button>
                    )}

                    {message.timestamp && (
                      <span className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-violet-400/50 bg-slate-900/80">
                      <User size={16} className="text-violet-200" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center space-x-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/60 bg-slate-900/80">
                    <Bot size={16} className="text-cyan-200" />
                  </div>
                  <div className="rounded-2xl border border-cyan-400/30 bg-slate-900/80 px-3 py-2">
                    <div className="flex space-x-1">
                      <div
                        className="h-2 w-2 rounded-full bg-cyan-300 animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      ></div>
                      <div
                        className="h-2 w-2 rounded-full bg-cyan-300 animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      ></div>
                      <div
                        className="h-2 w-2 rounded-full bg-cyan-300 animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
              <form
                onSubmit={handleSubmit}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isListening
                      ? '>>> the orb is listening to the waves in your voice'
                      : 'Let a question drift in…'
                  }
                  className={`flex-1 rounded-full border px-4 py-2 text-sm outline-none transition-all placeholder:text-slate-500 ${
                    isListening
                      ? 'border-cyan-400/70 bg-slate-950 text-cyan-50 placeholder:text-cyan-200/70 font-mono'
                      : 'border-slate-700 bg-slate-900/80 text-slate-100 focus:border-cyan-400/80'
                  }`}
                  style={{
                    fontFamily: isListening
                      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                      : undefined,
                  }}
                  disabled={isLoading}
                  readOnly={isListening}
                />
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-slate-100 transition-colors ${
                    isRecording
                      ? 'border-rose-400/70 bg-rose-500/80 animate-pulse'
                      : 'border-slate-700 bg-slate-900/80 hover:border-cyan-400/70 hover:bg-slate-900'
                  }`}
                  disabled={isLoading || continuousListening}
                  title={
                    continuousListening
                      ? 'Mic is auto-managed in continuous mode'
                      : 'Hold a fragment of sound'
                  }
                >
                  {isRecording ? <Square size={18} /> : <Mic size={18} />}
                </button>
                <button
                  type="submit"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/70 bg-cyan-400/90 text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.7)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                  disabled={!input.trim() || isLoading}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </main>

        <footer className="mt-4 text-center text-[0.7rem] uppercase tracking-[0.25em] text-slate-500">
          Somewhere above the Big Sur coastline, an orb drifts and listens.
        </footer>
      </div>
    </div>
  );
}
