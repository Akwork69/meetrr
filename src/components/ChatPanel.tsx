import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatPanelProps {
  messages: { text: string; from: "me" | "stranger" }[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

const ChatPanel = ({ messages, onSend, disabled }: ChatPanelProps) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-display text-primary">Chat</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-sm text-center mt-8">
            Messages will appear here...
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.from === "me"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              <span className="text-xs font-display opacity-70 block mb-1">
                {msg.from === "me" ? "You" : "Stranger"}
              </span>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={disabled}
          placeholder={disabled ? "Connect to chat..." : "Type a message..."}
          className="flex-1 bg-secondary text-secondary-foreground rounded-lg px-4 py-2 text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="bg-primary text-primary-foreground p-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
