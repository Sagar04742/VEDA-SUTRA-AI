import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StepViewer from './StepViewer.jsx';
import { CheckIcon, CopyIcon, LotusIcon } from './Icons.jsx';

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-2" role="status" aria-label="VedaSutra is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-gold-400" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-parchment/50 transition hover:text-gold-300" aria-label="Copy answer">
      {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function MessageBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-gold-500/30 bg-gold-600/25 px-4 py-2.5 sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const waiting = message.streaming && !message.content && !message.solver?.length;
  return (
    <div className="flex gap-3">
      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold-500/40 bg-ink-800 text-gold-300">
        <LotusIcon width={18} height={18} />
      </span>
      <div className="min-w-0 flex-1">
        {waiting && <TypingIndicator />}
        {message.solver?.map((r, i) => <StepViewer key={i} result={r} />)}
        {message.content && (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>
              {message.content}
            </ReactMarkdown>
            {message.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gold-300 align-middle" aria-hidden />}
          </div>
        )}
        {!message.streaming && message.content && (
          <div className="mt-1">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}
