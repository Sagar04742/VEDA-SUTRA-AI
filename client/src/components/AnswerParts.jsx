import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StepViewer from './StepViewer.jsx';
import ActivityTrail, { SourceBadge } from './ActivityTrail.jsx';
import { CheckIcon, CopyIcon, GlobeIcon } from './Icons.jsx';

// Pieces of an assistant answer, shared by the normal bubble and the side-by-side comparison.

export function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-2" role="status" aria-label="VedaSutra is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-gold-400" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export function CopyButton({ text }) {
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

// Web pages used by "Web search".
export function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs">
      <p className="mb-1 flex items-center gap-1.5 text-parchment/60"><GlobeIcon width={14} height={14} /> From the web</p>
      <ul className="space-y-0.5">
        {sources.map((s) => (
          <li key={s.uri} className="truncate">
            <a className="text-gold-300 underline underline-offset-2" href={s.uri} target="_blank" rel="noreferrer noopener">{s.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The body of one answer: solver steps, then the Markdown text, web sources and a copy button.
// `message` = { content, solver, sources, streaming }.
export function AnswerBody({ message, warnUngrounded = false }) {
  const waiting = message.streaming && !message.content && !message.solver?.length && !message.activity?.length;
  return (
    <>
      <SourceBadge items={message.activity} streaming={message.streaming} warnUngrounded={warnUngrounded && Boolean(message.content)} />
      <ActivityTrail items={message.activity} />
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
      {!message.streaming && <Sources sources={message.sources} />}
      {!message.streaming && message.content && (
        <div className="mt-1">
          <CopyButton text={message.content} />
        </div>
      )}
    </>
  );
}
