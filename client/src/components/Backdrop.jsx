// The living background behind every page: your temple-at-dusk photo, drifting light, twinkling stars.
// (Colours and the photo's brightness change with the theme; see index.css.)

// Fixed "random" star positions so they do not jump around on every render.
const STARS = Array.from({ length: 44 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 97.13 + n * 31.7) + 1) / 2);
  return { left: `${r(1) * 100}%`, top: `${r(2) * 62}%`, size: 1 + Math.round(r(3) * 2), delay: `${(r(4) * 6).toFixed(2)}s`, duration: `${(3 + r(5) * 4).toFixed(2)}s` };
});

export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="photo" />
      <div className="tint" />
      <div className="glow-orb orb-a" />
      <div className="glow-orb orb-b" />
      <div className="glow-orb orb-c" />
      {STARS.map((s, i) => (
        <span key={i} className="star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }} />
      ))}
    </div>
  );
}
