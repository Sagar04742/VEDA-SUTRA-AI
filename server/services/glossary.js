// A small Hindi/Devanagari -> English glossary of this project's own vocabulary. The knowledge base is written in English,
// so a question in Hindi cannot be matched word for word. The answer checker (Pramana) uses this glossary ONLY to find
// the right knowledge-base entry for a Hindi question; it is not used to answer questions or to translate answers.

const TERMS = {
  // Vedic maths
  'वैदिक': 'vedic', 'वेद': 'veda', 'वेदों': 'veda', 'गणित': 'mathematics', 'सूत्र': 'sutra', 'सूत्रों': 'sutra', 'उपसूत्र': 'sub-sutra',
  'गुणा': 'multiply', 'गुणन': 'multiplication', 'वर्ग': 'square', 'घन': 'cube', 'भाग': 'division', 'जोड़': 'addition', 'घटाना': 'subtraction',
  'विधि': 'method', 'तरीका': 'method', 'नियम': 'rule', 'अंक': 'digit', 'संख्या': 'number', 'शून्य': 'zero', 'दशमलव': 'decimal',
  'निखिलम्': 'nikhilam', 'निखिलं': 'nikhilam', 'निखिलम': 'nikhilam', 'ऊर्ध्वतिर्यग्भ्याम्': 'urdhva tiryagbhyam', 'एकाधिकेन': 'ekadhikena', 'पूर्वेण': 'purvena',
  'यावदूनम्': 'yavadunam', 'परावर्त्य': 'paravartya', 'आनुरूप्ये': 'anurupye', 'शून्यमन्यत्': 'sunyam', 'संकलन': 'sankalana',
  // ancient science
  'प्राचीन': 'ancient', 'भारतीय': 'indian', 'भारत': 'india', 'विज्ञान': 'science', 'खगोल': 'astronomy', 'खगोलशास्त्र': 'astronomy', 'ज्योतिष': 'jyotish astronomy',
  'आयुर्वेद': 'ayurveda', 'चिकित्सा': 'medicine', 'औषधि': 'medicine', 'शल्य': 'surgery', 'शल्यचिकित्सा': 'surgery', 'सुश्रुत': 'sushruta', 'चरक': 'charaka',
  'आर्यभट': 'aryabhata', 'आर्यभटीय': 'aryabhatiya', 'ब्रह्मगुप्त': 'brahmagupta', 'भास्कर': 'bhaskara', 'वराहमिहिर': 'varahamihira', 'पाणिनि': 'panini', 'पिंगल': 'pingala',
  'माधव': 'madhava', 'केरल': 'kerala', 'वास्तु': 'vastu', 'स्थापत्य': 'architecture', 'लौह': 'iron', 'स्तंभ': 'pillar', 'स्तम्भ': 'pillar', 'दिल्ली': 'delhi',
  'नक्षत्र': 'nakshatra', 'ग्रहण': 'eclipse', 'पंचांग': 'calendar', 'कैलेंडर': 'calendar', 'सूर्य': 'sun surya', 'चंद्र': 'moon', 'चन्द्र': 'moon', 'ग्रह': 'planet',
  'त्रिकोणमिति': 'trigonometry', 'ज्या': 'sine', 'ज्यामिति': 'geometry', 'शुल्ब': 'shulba', 'शुल्बसूत्र': 'shulba sutra', 'बौधायन': 'baudhayana', 'पाइथागोरस': 'pythagoras',
  'भस्म': 'bhasma', 'रसशास्त्र': 'rasashastra', 'धातु': 'metal', 'इतिहास': 'history', 'ग्रंथ': 'text', 'ग्रन्थ': 'text', 'पुस्तक': 'book',
  'विमान': 'vimana', 'संस्कृत': 'sanskrit', 'श्लोक': 'verse',
  // question words that carry no topic are dropped by the checker's own stop-word list
};

// "वैदिक गणित में वर्ग क्या है?" -> "vedic mathematics square". Words not in the glossary are dropped; Latin words and digits stay.
export function toEnglishQuery(text) {
  const out = [];
  for (const token of String(text ?? '').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)) {
    const hit = TERMS[token] ?? TERMS[token.normalize('NFC')];
    if (hit) out.push(hit);
    else if (/^[A-Za-z0-9]+$/.test(token)) out.push(token);
  }
  return out.join(' ').trim();
}

export const glossarySize = Object.keys(TERMS).length;
