import { LotusIcon } from './Icons.jsx';
import { AnswerBody } from './AnswerParts.jsx';
import BattleCard from './BattleCard.jsx';
import { imageUrl } from '../api/chats.js';

// Pictures the user attached. Local ones show an in-memory preview; saved ones load from the server.
function Pictures({ images, chatId }) {
  if (!images?.length) return null;
  return (
    <div className="mb-2 flex flex-wrap justify-end gap-2">
      {images.map((img) => {
        const src = img.preview || imageUrl(chatId, img.id);
        return (
          <a key={img.id} href={src} target="_blank" rel="noreferrer noopener" title="Open full size">
            <img src={src} alt="Attached by you" className="max-h-48 max-w-[70vw] rounded-xl border border-gold-500/30 object-cover sm:max-w-xs" loading="lazy" />
          </a>
        );
      })}
    </div>
  );
}

export default function MessageBubble({ message, chatId }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end">
        <Pictures images={message.images} chatId={chatId} />
        {message.content && (
          <div className="pop-in max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-gold-400/60 bg-gradient-to-br from-gold-400/45 to-gold-600/30 px-4 py-2.5 shadow-lg shadow-black/10 backdrop-blur-md sm:max-w-[75%]">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  // Shastrarth: two answers side by side, then the Pramana verdict.
  if (message.battle) return <BattleCard message={message} />;

  return (
    <div className="pop-in flex gap-3">
      <span className={`mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-400/60 bg-gradient-to-br from-ink-800 to-ink-900 text-gold-300 shadow-lg ${message.streaming ? 'glow-pulse' : ''}`}>
        <LotusIcon width={22} height={22} />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-gold-500/35 bg-ink-900/70 px-5 py-4 shadow-lg shadow-black/10 backdrop-blur-md">
        <AnswerBody message={message} />
      </div>
    </div>
  );
}
