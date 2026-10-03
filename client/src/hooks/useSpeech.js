import { useCallback, useEffect, useRef, useState } from 'react';

// Voice-to-text using the browser's built-in speech recognition (Chrome, Edge, Safari; not Firefox).
// No server code or API key. Note: Chrome sends the audio to Google's speech service to transcribe it.
const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  { code: 'en-US', label: 'English (US)' },
];

const MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'no-speech': "I didn't hear anything. Tap the microphone and try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Voice typing needs an internet connection.',
  'language-not-supported': 'This browser does not support voice typing in that language.',
};

// onText(fullText) is called while the user speaks, with their existing text plus what was heard.
export function useSpeech({ lang, onText }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(
    (existingText = '') => {
      if (!SpeechRecognition || recRef.current) return;
      setError('');
      const rec = new SpeechRecognition();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      const base = existingText.trimEnd();

      rec.onresult = (e) => {
        const heard = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
        onTextRef.current(base ? `${base} ${heard}` : heard);
      };
      rec.onerror = (e) => {
        if (e.error !== 'aborted') setError(MESSAGES[e.error] || 'Voice typing stopped unexpectedly.');
      };
      rec.onend = () => {
        recRef.current = null;
        setListening(false);
      };
      try {
        rec.start();
        recRef.current = rec;
        setListening(true);
      } catch {
        setError('Could not start voice typing. Please try again.');
      }
    },
    [lang]
  );

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: Boolean(SpeechRecognition), listening, error, start, stop, clearError: () => setError('') };
}
