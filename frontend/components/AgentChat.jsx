// frontend/components/AgentChat.jsx 
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, Loader2, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// CUSTOM MARKDOWN PARSER
const parseCustomMarkdown = (text) => {
  if (!text) return null;

  return text.split('\n').map((line, index) => {
    // Maintain empty lines for paragraph spacing
    if (line.trim() === '') return <div key={index} className="h-2"></div>;

    // Inline formatting (Bold)
    const formatInline = (str) => {
      // Regex captures fully closed **text** OR partially open **text at the end of the string
      // This ensures text becomes bold the second the animation types the first **
      const parts = str.split(/(\*\*.*?\*\*|\*\*.*$)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**')) {
          // Strip leading and trailing asterisks securely
          const content = part.replace(/^\*\*|\*\*$/g, '');
          return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{content}</strong>;
        }
        return <span key={i}>{part}</span>;
      });
    };

    // Handle Bullet Lists (* item)
    if (line.trim().startsWith('* ')) {
      return (
        <div key={index} className="flex gap-2 ml-2 mt-1">
          <span className="text-blue-500 dark:text-blue-400 font-bold">•</span>
          <span>{formatInline(line.replace(/^\*\s+/, ''))}</span>
        </div>
      );
    }

    // Handle Numbered Lists (1. item)
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      return (
        <div key={index} className="flex gap-2 ml-2 mt-1">
          <span className="font-semibold text-blue-600 dark:text-blue-400">{numMatch[1]}.</span>
          <span>{formatInline(numMatch[2])}</span>
        </div>
      );
    }

    // Standard Text Line
    return (
      <div key={index} className="mt-1">
        {formatInline(line)}
      </div>
    );
  });
};

// TYPEWRITER ANIMATION COMPONENT 
const TypewriterMessage = ({ text, animate, onUpdate }) => {
  const [displayedText, setDisplayedText] = useState(animate ? "" : text);
  const [isTyping, setIsTyping] = useState(animate);

  // Use a ref to hold the onUpdate function. 
  // This prevents React from thinking the dependency changed on every keystroke.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    // If it's already finished typing, completely ignore this effect
    if (!isTyping) return;

    const words = text.split(" ");
    let currentIndex = 0;
    
    const intervalId = setInterval(() => {
      if (currentIndex < words.length) {
        currentIndex++;
        setDisplayedText(words.slice(0, currentIndex).join(" "));
        if (onUpdateRef.current) onUpdateRef.current(); 
      } else {
        clearInterval(intervalId);
        setIsTyping(false); // Permanently lock the animation for this specific message
      }
    }, 70);

    return () => clearInterval(intervalId);
  }, [text, isTyping]); // ONLY depend on text and the internal typing state

  return <div className="text-slate-700 dark:text-slate-300 leading-relaxed">{parseCustomMarkdown(displayedText)}</div>;
};

export default function AgentChat() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([
    { 
      role: "agent", 
      text: "AI Officer online. I am monitoring the Bengaluru grid. How can I assist with deployment today?", 
      animate: false 
    },
    { 
      role: "agent", 
      text: "Awaiting your command...", 
      animate: false 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  // Initialize a unique session ID when the app first loads
  useEffect(() => {
    const generateSessionId = () => `cmd_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    setSessionId(generateSessionId());
  }, []);

  const telemetryLogs = [
    "Parsing Commander intent...",
    "Extracting coordinates...",
    "Querying H3 hex-grid network...",
    "Calculating predictive impact scores...",
    "Polling atmospheric grid data...",
    "Cross-referencing historical telemetry...",
    "Synthesizing tactical deployment strategy..."
  ];

  const quickActions = [
    "Initiate radar sweep for worst hotspots ",
    "Analyze parking impact at ",
    "Where should I deploy towing vans today? ",
    "Clearance status for Elite Junction ",
    "The top 3 critical choke points right now ", 
    "Evaluate weather-related deployment risks for ",
    "Assess spillover parking severity at ",
    "Which zones require increased routine patrols? ", 
    "Provide a full grid stability report for the current hour "
  ];

  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isScrolledUp = useRef(false);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // If the user is more than 50px away from the bottom, they are "scrolled up"
    isScrolledUp.current = scrollHeight - scrollTop - clientHeight > 50;
  };

  const scrollToBottom = useCallback((force = false) => {
    if (isScrolledUp.current && force !== true) return;
    
    // Use "auto" (instant) for word-by-word to stop jitter. Use "smooth" when user hits send.
    messagesEndRef.current?.scrollIntoView({ behavior: force === true ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    let interval;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => {
          // Stop at the last step so it doesn't loop back to the beginning awkwardly
          if (prev === telemetryLogs.length - 1) return prev;
          return prev + 1;
        });
      }, 1000); // Changes log every 1.0 second 
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleInput = (e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Populate Input Handler 
  const handleQuickActionClick = (actionText) => {
    setInput(actionText);
    
    // Auto-focus the text area and adjust its height so the user can immediately type
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
    }, 0);
  };

  // --- MEMORY WIPE FUNCTION ---
  const resetSecureLink = () => {
    // 1. Generate a brand new thread ID
    const newSession = `cmd_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    setSessionId(newSession);
    
    // 2. Clear the UI chat history and announce the reset
    setMessages([
      { 
        role: "agent", 
        text: "Secure link re-established. Previous contextual memory wiped. Ready for new deployment commands...", 
        animate: true 
      }
    ]);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsLoading(true);

    // Force the scroll down when the user sends a message
    isScrolledUp.current = false;
    setTimeout(() => scrollToBottom(true), 50);

    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }

    try {
      const response = await axios.post(`${API_BASE}/api/v1/chat`, {
        message: userMsg,
        session_id: "commander_1" // sessionId
      });
      
      // Push the new message with the animate flag set to true
      setMessages((prev) => [...prev, { role: "agent", text: response.data.reply, animate: true }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "agent", text: "⚠️ **System Alert:** Communication with central server failed.", animate: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-blue-50 dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl transition-colors duration-300">
      
      {/* --- HEADER WITH RESET MEMORY BUTTON --- */}
      <div className="p-3 sm:p-4 border-b border-blue-500 dark:border-slate-700 bg-blue-200 dark:bg-slate-800 flex-none flex items-center justify-between shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">AI Intelligence Terminal</h2>
        </div>
        
        <Button 
          onClick={resetSecureLink}
          disabled={isLoading}
          variant="ghost" 
          size="sm" 
          className="text-blue-700 dark:text-blue-300 hover:bg-blue-300 dark:hover:bg-slate-700 hover:text-blue-900 dark:hover:text-blue-100 text-xs px-2 h-7 rounded-md font-semibold transition-colors"
          title="Wipe LLM Memory Context"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Reset Link
        </Button>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg p-3 text-sm shadow-sm border ${
              msg.role === "user" 
                ? "bg-blue-600 text-white border-blue-700 rounded-br-none" 
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-bl-none"
            }`}>
              {msg.role === "user" ? (
                <span className="whitespace-pre-wrap">{msg.text}</span>
              ) : (
                <TypewriterMessage 
                  text={msg.text} 
                  animate={msg.animate} 
                  onUpdate={scrollToBottom} 
                />
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm shadow-sm rounded-bl-none flex flex-col gap-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                <Bot className="w-4 h-4" />
                <span>AI Officer Processing...</span>
              </div>
              
              {/* Terminal-style inner box */}
              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-2 rounded flex items-center gap-2 shadow-inner">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500 dark:text-blue-400 flex-none" />
                <span className="truncate">{telemetryLogs[loadingStep]}</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 sm:p-4 bg-blue-200 dark:bg-slate-800 border-t border-blue-500 dark:border-slate-700 flex-none flex flex-col gap-3 transition-colors duration-300">
        
        <div className="flex gap-2 overflow-x-auto pb-3 pt-1 px-1 
          [&::-webkit-scrollbar]:h-1.5 
          [&::-webkit-scrollbar-track]:bg-slate-100/50 
          dark:[&::-webkit-scrollbar-track]:bg-slate-700/50
          [&::-webkit-scrollbar-track]:rounded-full 
          [&::-webkit-scrollbar-thumb]:bg-blue-400 
          dark:[&::-webkit-scrollbar-thumb]:bg-blue-600
          [&::-webkit-scrollbar-thumb]:rounded-full 
          hover:[&::-webkit-scrollbar-thumb]:bg-blue-500 
          transition-colors"
        >
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickActionClick(action)}
              disabled={isLoading}
              className="flex-none flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white dark:bg-slate-700 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-[11px] sm:text-xs font-semibold rounded-full hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white dark:hover:text-white hover:border-blue-600 dark:hover:border-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-3 h-3" />
              {action}
            </button>
          ))}
        </div>

        {/* Text Input Row */}
        <div className="flex gap-2 items-end">
          <textarea 
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask for deployment strategies or grid analysis..."
            disabled={isLoading}
            rows={1}
            className="flex-1 min-h-10 max-h-30 p-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-y-auto placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-50"
          />
          <Button 
            onClick={() => sendMessage()} 
            disabled={isLoading || !input.trim()} 
            className="bg-blue-500 hover:bg-blue-600 h-10 px-4 shadow-sm flex-none"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

    </div>
  );
}