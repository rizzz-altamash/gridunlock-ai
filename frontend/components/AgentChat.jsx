"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";

// ----------------------------------------------------------------------
// 1. CUSTOM MARKDOWN PARSER
// ----------------------------------------------------------------------
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
          return <strong key={i} className="font-semibold text-slate-900">{content}</strong>;
        }
        return <span key={i}>{part}</span>;
      });
    };

    // Handle Bullet Lists (* item)
    if (line.trim().startsWith('* ')) {
      return (
        <div key={index} className="flex gap-2 ml-2 mt-1">
          <span className="text-blue-500 font-bold">•</span>
          <span>{formatInline(line.replace(/^\*\s+/, ''))}</span>
        </div>
      );
    }

    // Handle Numbered Lists (1. item)
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      return (
        <div key={index} className="flex gap-2 ml-2 mt-1">
          <span className="font-semibold text-blue-600">{numMatch[1]}.</span>
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

// ----------------------------------------------------------------------
// 2. TYPEWRITER ANIMATION COMPONENT 
// ----------------------------------------------------------------------
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

  return <div className="text-slate-700 leading-relaxed">{parseCustomMarkdown(displayedText)}</div>;
};

// ----------------------------------------------------------------------
// 3. MAIN CHAT INTERFACE
// ----------------------------------------------------------------------
export default function AgentChat() {
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
  const telemetryLogs = [
    "Parsing Commander intent...",
    "Extracting coordinates...",
    "Querying H3 hex-grid network...",
    "Calculating predictive impact scores...",
    "Polling atmospheric grid data...",
    "Cross-referencing historical telemetry...",
    "Synthesizing tactical deployment strategy..."
  ];

  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isScrolledUp = useRef(false);

  // Detects if the user is scrolling up to read
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
      }, 1200); // Changes log every 1.2 seconds
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
      const response = await axios.post("http://localhost:8000/api/v1/chat", {
        message: userMsg,
        session_id: "commander_1"
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
    <div className="flex flex-col h-full bg-blue-50 border-l border-slate-200 overflow-hidden shadow-xl">
      
      <div className="p-5 border-b border-blue-500 bg-blue-200 flex-none flex items-center gap-2">
        <Bot className="w-6 h-6 text-blue-600" />
        <h2 className="font-semibold text-slate-800">AI Intelligence Terminal</h2>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg p-3 text-sm shadow-sm border ${
              msg.role === "user" 
                ? "bg-blue-600 text-white border-blue-700 rounded-br-none" 
                : "bg-white border-slate-200 rounded-bl-none"
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
            <div className="max-w-[85%] bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm shadow-sm rounded-bl-none flex flex-col gap-2">
              <div className="flex items-center gap-2 text-blue-600 font-medium animate-pulse">
                <Bot className="w-4 h-4" />
                <span>AI Officer Processing...</span>
              </div>
              
              {/* Terminal-style inner box */}
              <div className="font-mono text-[11px] text-slate-500 bg-white border border-slate-100 p-2 rounded flex items-center gap-2 shadow-inner">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-none" />
                <span className="truncate">{telemetryLogs[loadingStep]}</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-blue-200 border-t border-blue-500 flex-none flex gap-2 items-end">
        <textarea 
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Request deployment strategies..."
          disabled={isLoading}
          rows={1}
          className="flex-1 min-h-10 max-h-30 p-2 px-3 text-sm bg-white border border-slate-300 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-y-auto placeholder:text-slate-400"
        />
        <Button 
          onClick={sendMessage} 
          disabled={isLoading || !input.trim()} 
          className="bg-blue-500 hover:bg-blue-600 h-10 px-4 shadow-sm"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

    </div>
  );
}