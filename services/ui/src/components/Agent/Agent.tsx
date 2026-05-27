import { useState } from "react";
import { sendMessage } from "../../api/client";
import type { AgentResponse } from "../../api/types";
import Button from "../ui/Button";
import ErrorMessage from "../ui/ErrorMessage";

type UserMessage = {
  role: "user";
  content: string;
};

type AgentMessage = {
  role: "agent";
  content: string;
  intent: string;
  confidence: number;
};

type Message = UserMessage | AgentMessage;

let messageId = 0;
const nextId = () => `msg-${++messageId}`;

const Agent = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ id: string; message: Message }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: nextId(), message: { role: "user", content: userMessage } }]);
    setLoading(true);

    try {
      const response: AgentResponse = await sendMessage(userMessage);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          message: {
            role: "agent",
            content: response.agent.response,
            intent: response.agent.intent,
            confidence: response.agent.confidence,
          },
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="agent-messages" role="log" aria-label="Chat messages">
        {messages.length === 0 && (
          <p className="agent-empty">Ask me anything about your services.</p>
        )}
        {messages.map(({ id, message: msg }) => (
          <div key={id} className={`agent-message agent-message--${msg.role}`}>
            <span className="agent-message-role">{msg.role === "user" ? "You" : "Agent"}</span>
            <p className="agent-message-content">{msg.content}</p>
            {msg.role === "agent" && (
              <span className="agent-message-meta">
                {msg.intent} ({(msg.confidence * 100).toFixed(0)}%)
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="agent-message agent-message--agent">
            <span className="agent-message-role">Agent</span>
            <p className="agent-message-content agent-typing">Thinking...</p>
          </div>
        )}
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="agent-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help?"
          className="agent-input"
          aria-label="Message input"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? "..." : "Send"}
        </Button>
      </div>
    </>
  );
};

export { Agent };
