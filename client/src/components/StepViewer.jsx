import { RootIcon } from './Icons.jsx';

// Renders a solver result: the method, the final answer, and numbered working.
// `result` is { tool, method, answer, steps[] } straight from the server.
export default function StepViewer({ result }) {
  return (
    <section className="my-3 overflow-hidden rounded-xl border border-gold-500/40 bg-ink-900/80" aria-label="Worked solution">
      <header className="flex items-center gap-2 border-b border-gold-500/20 bg-gold-500/10 px-4 py-2 text-sm">
        <RootIcon className="text-gold-300" width={18} height={18} />
        <span className="font-medium capitalize text-gold-200">{result.method}</span>
        <span className="ml-auto rounded-full bg-gold-300 px-3 py-0.5 font-semibold text-ink-950">= {result.answer}</span>
      </header>
      <ol className="space-y-2 px-4 py-3 text-sm">
        {result.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold-400/60 text-xs text-gold-300">{i + 1}</span>
            <span className="min-w-0 break-words text-parchment/90">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
