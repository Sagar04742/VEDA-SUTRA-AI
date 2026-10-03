// Starter questions for the "Vedic Maths" and "Ancient Science" cards. Each click gives a different one.
// They are chosen so the assistant can answer them from its solver or its sourced library.
export const POOLS = {
  maths: [
    'Multiply 98 × 97 using a Vedic maths technique',
    'What is the Nikhilam sutra and when should I use it?',
    'Square 105 using Ekadhikena Purvena',
    'How do I multiply 46 × 99 quickly?',
    'What is Urdhva-Tiryagbhyam? Show 23 × 14.',
    'What is the digit sum of 7849, and how does casting out nines work?',
    'Is 1001 divisible by 7? Show me the test.',
    'Convert 68 to vinculum form',
    'Divide 1234 by 9 using the Vedic method',
    'How can I square 48 using a half base?',
    'What are the 16 sutras of Vedic mathematics?',
    'Multiply 47 × 43 using the "last digits add to 10" trick',
    'Who compiled Vedic Mathematics, and are the sutras really from the Vedas?',
    'Square 88 using Yavadunam',
    'Multiply 107 × 104 the Vedic way',
    'What is Ekanyunena Purvena used for?',
  ],
  science: [
    'What is the concept of zero in ancient India?',
    'What is the Delhi Iron Pillar and why is it famous?',
    'What are nakshatras?',
    'What did Aryabhata contribute to mathematics and astronomy?',
    'What are the Sulba Sutras about?',
    'Who was Pingala and why does he matter to mathematics?',
    'What is the chakravala method?',
    'What did Madhava of Sangamagrama contribute?',
    'Which ancient texts are foundational for Ayurveda and surgery?',
    'Did the Kerala school invent calculus?',
    'What is the Bakhshali manuscript?',
    'What is Vedanga Jyotisha?',
    'Does the Vymanika Shastra prove ancient Indian aeroplanes?',
    'What do we know about ancient Indian zinc smelting?',
    'What is Lilavati by Bhaskara II?',
    'How did Indian astronomers predict eclipses?',
  ],
};

// A shuffled "deck" per topic: every question comes up once before any repeats,
// and the first card of a new deck is never the one you just saw.
const decks = {};
const last = {};

function shuffled(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomPrompt(topicId) {
  const pool = POOLS[topicId];
  if (!pool?.length) return '';
  if (!decks[topicId]?.length) {
    decks[topicId] = shuffled(pool);
    if (decks[topicId].length > 1 && decks[topicId].at(-1) === last[topicId]) decks[topicId].reverse();
  }
  last[topicId] = decks[topicId].pop();
  return last[topicId];
}
