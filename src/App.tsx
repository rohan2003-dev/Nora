import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Send, Volume2, VolumeX, History, Settings, X, Globe, Youtube, MessageSquare } from 'lucide-react';
import { cn } from './lib/utils';
import { Message, NoraState } from './types';
import { generateNoraResponse } from './services/gemini';

// --- Components ---

const Orb = ({ state }: { state: NoraState }) => {
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      {/* Outer Glow */}
      <motion.div
        animate={{
          scale: state === 'listening' ? [1, 1.2, 1] : 1,
          opacity: state === 'listening' ? [0.5, 0.8, 0.5] : 0.3,
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className={cn(
          "absolute inset-0 rounded-full blur-3xl",
          state === 'listening' ? "bg-nora-blue" : 
          state === 'thinking' ? "bg-nora-purple" : 
          state === 'speaking' ? "bg-cyan-400" : "bg-white/20"
        )}
      />
      
      {/* Main Orb */}
      <motion.div
        animate={{
          scale: state === 'thinking' ? [1, 1.05, 1] : 1,
          rotate: state === 'thinking' ? 360 : 0,
        }}
        transition={{ 
          scale: { repeat: Infinity, duration: 2 },
          rotate: { repeat: Infinity, duration: 4, ease: "linear" }
        }}
        className={cn(
          "w-32 h-32 rounded-full relative z-10 flex items-center justify-center overflow-hidden shadow-2xl",
          "bg-gradient-to-br from-nora-blue via-nora-purple to-pink-500",
          "border border-white/20"
        )}
      >
        {/* Internal Swirls */}
        <div className="absolute inset-0 opacity-50 mix-blend-overlay animate-pulse">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-white/40" />
        </div>
        
        {/* Waveform when speaking */}
        {state === 'speaking' && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ height: [10, 40, 10] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                className="w-1 bg-white rounded-full"
              />
            ))}
          </div>
        )}
        
        {state === 'listening' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white/80"
          >
            <Mic className="w-10 h-10" />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

const ChatMessage = ({ message }: { message: Message }) => {
  const isNora = message.role === 'nora';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full mb-4",
        isNora ? "justify-start" : "justify-end"
      )}
    >
      <div className={cn(
        "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
        isNora 
          ? "glass text-white rounded-tl-none" 
          : "bg-nora-blue text-black font-medium rounded-tr-none"
      )}>
        {message.content}
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [state, setState] = useState<NoraState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Use refs to avoid stale closures in event handlers
  const stateRef = useRef<NoraState>(state);
  const permissionErrorRef = useRef<boolean>(permissionError);
  const isRecognitionRunning = useRef<boolean>(false);
  const messagesRef = useRef<Message[]>(messages);

  const startRecognition = () => {
    if (recognitionRef.current && !isRecognitionRunning.current) {
      try {
        isRecognitionRunning.current = true;
        recognitionRef.current.start();
      } catch (e) {
        // If it fails, it might already be running or in a transition state
        console.error('SpeechRecognition start error:', e);
        // We don't set it to false here because if it's already running, 
        // we want the ref to stay true. onend will eventually reset it.
      }
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current && isRecognitionRunning.current) {
      try {
        recognitionRef.current.stop();
        // We don't set isRecognitionRunning to false here; onend will handle it
      } catch (e) {
        console.error('SpeechRecognition stop error:', e);
      }
    }
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    permissionErrorRef.current = permissionError;
  }, [permissionError]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        isRecognitionRunning.current = true;
      };

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        handleUserInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        // Only log if it's not a common 'no-speech' timeout
        if (event.error !== 'no-speech') {
          console.error('Speech recognition error', event.error);
        }
        
        if (event.error === 'not-allowed') {
          setPermissionError(true);
        }
        
        if (event.error !== 'no-speech') {
          setState('idle');
        }
      };

      recognitionRef.current.onend = () => {
        isRecognitionRunning.current = false;
        // Only restart if we're still in listening state AND no permission error occurred
        if (stateRef.current === 'listening' && !permissionErrorRef.current) {
          setTimeout(() => {
            if (stateRef.current === 'listening') {
              startRecognition();
            }
          }, 100);
        }
      };
    }

    synthRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const speak = (text: string) => {
    if (!synthRef.current || isMuted) return;
    
    // Stop recognition while speaking to avoid feedback
    if (state === 'listening') stopRecognition();
    
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a nice female voice
    const voices = synthRef.current.getVoices();
    const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google US English') || v.name.includes('Samantha'));
    if (femaleVoice) utterance.voice = femaleVoice;
    
    utterance.pitch = 1.1;
    utterance.rate = 1;
    
    utterance.onstart = () => setState('speaking');
    utterance.onend = () => {
      setState('idle');
      // Resume listening if it was active
      if (stateRef.current === 'listening') startRecognition();
    };
    
    synthRef.current.speak(utterance);
  };

  const parseAction = (text: string) => {
    const actionMatch = text.match(/\[ACTION:(.*?):(.*?)\]/);
    if (actionMatch) {
      const type = actionMatch[1];
      const payload = actionMatch[2];
      const cleanText = text.replace(actionMatch[0], '').trim();
      
      executeAction(type, payload);
      return cleanText;
    }
    return text;
  };

  const executeAction = (type: string, payload: string) => {
    console.log(`Executing action: ${type} with payload: ${payload}`);
    
    switch (type) {
      case 'OPEN':
      case 'OPEN_SITE':
        window.open(payload.startsWith('http') ? payload : `https://${payload}`, '_blank');
        break;
      case 'SEARCH':
      case 'SEARCH_GOOGLE':
        window.open(`https://www.google.com/search?q=${encodeURIComponent(payload)}`, '_blank');
        break;
      case 'PLAY_YOUTUBE':
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(payload)}`, '_blank');
        break;
      case 'PLAY_SPOTIFY':
        window.open(`https://open.spotify.com/search/${encodeURIComponent(payload)}`, '_blank');
        break;
      case 'WHATSAPP':
      case 'SEND_WHATSAPP':
        const [contact, msg] = payload.split('|');
        window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(msg || '')}`, '_blank');
        break;
      default:
        console.warn('Unknown action type:', type);
    }
  };

  const handleUserInput = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setState('thinking');

    // Prepare history for Gemini using messagesRef to avoid stale closures
    const history = messagesRef.current.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const rawResponse = await generateNoraResponse(text, history);
    const cleanResponse = parseAction(rawResponse);

    const noraMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'nora',
      content: cleanResponse,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, noraMsg]);
    speak(cleanResponse);
  };

  const toggleListening = () => {
    if (state === 'listening') {
      stopRecognition();
      setState('idle');
    } else {
      setPermissionError(false);
      startRecognition();
      setState('listening');
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      handleUserInput(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-nora-blue/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-nora-purple/10 blur-[120px] rounded-full" />

      {/* Permission Error Toast */}
      <AnimatePresence>
        {permissionError && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] glass px-6 py-3 rounded-full border-red-500/50 flex items-center gap-3"
          >
            <MicOff className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium">Microphone access denied. Please check browser permissions.</span>
            <button onClick={() => setPermissionError(false)} className="ml-2 hover:bg-white/10 rounded-full p-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 nora-gradient rounded-lg flex items-center justify-center">
            <span className="font-bold text-black text-xs">N</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Nora</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <History className="w-5 h-5 text-white/60" />
          </button>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-white/60" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center gap-12 z-10">
        {/* Orb Section */}
        <div className="flex flex-col items-center gap-4">
          <Orb state={state} />
          <motion.p 
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-white/40 text-sm font-medium uppercase tracking-[0.2em]"
          >
            {state === 'idle' ? 'Ready' : 
             state === 'listening' ? 'Listening...' : 
             state === 'thinking' ? 'Thinking...' : 'Speaking...'}
          </motion.p>
        </div>

        {/* Chat Display */}
        <div className="w-full max-w-2xl h-48 overflow-y-auto px-4 scroll-smooth mask-fade-edges" ref={scrollRef}>
          <AnimatePresence mode="popLayout">
            {messages.slice(-3).map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer / Input */}
      <footer className="w-full max-w-2xl pb-8 px-4 z-50">
        <div className="relative flex items-center gap-3">
          <button 
            onClick={toggleListening}
            className={cn(
              "p-4 rounded-2xl transition-all duration-300 shadow-lg",
              state === 'listening' 
                ? "bg-red-500 text-white animate-pulse" 
                : "glass text-white hover:bg-white/10"
            )}
          >
            {state === 'listening' ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Nora anything..."
              className="w-full glass rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-nora-blue/50 transition-all placeholder:text-white/20"
            />
            <button 
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-nora-blue hover:text-white disabled:opacity-30 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex justify-center gap-4 mt-6">
          <QuickAction icon={<Globe className="w-4 h-4" />} label="Open YouTube" onClick={() => handleUserInput("Open YouTube")} />
          <QuickAction icon={<Youtube className="w-4 h-4" />} label="Play Lo-fi" onClick={() => handleUserInput("Play lo-fi music on YouTube")} />
          <QuickAction icon={<MessageSquare className="w-4 h-4" />} label="WhatsApp" onClick={() => handleUserInput("Open WhatsApp")} />
        </div>
      </footer>

      {/* History Sidebar */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed top-0 right-0 h-full w-80 glass z-[100] p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">History</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.length === 0 ? (
                <p className="text-white/20 text-center mt-20">No conversation history yet.</p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "p-3 rounded-xl text-xs",
                    msg.role === 'user' ? "bg-nora-blue/10 border border-nora-blue/20" : "bg-white/5 border border-white/10"
                  )}>
                    <span className="opacity-40 uppercase text-[10px] block mb-1">{msg.role}</span>
                    {msg.content}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 glass rounded-full text-[10px] uppercase tracking-wider font-semibold hover:bg-white/10 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
