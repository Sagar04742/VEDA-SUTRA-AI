// Small inline SVG icons (stroke = currentColor) so we need no icon library.
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const make = (children) => (props) => <svg {...base} {...props}>{children}</svg>;

export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const ChevronRight = make(<path d="M9 6l6 6-6 6" />);
export const ChevronLeft = make(<path d="M15 6l-6 6 6 6" />);
export const MenuIcon = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const ChatIcon = make(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />);
export const LogoutIcon = make(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />);
export const SendIcon = make(<path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />);
export const ArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const DotsIcon = make(<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>);
// Square-root sign for Vedic Maths
export const RootIcon = make(<path d="M3 13l3-1 3 7 5-15h7M15 11l5 5M20 11l-5 5" />);
// Temple / pillars for Ancient Science
export const TempleIcon = make(<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M3 10l9-6 9 6H3z" />);
export const LotusIcon = make(
  <path d="M12 4c2 2.5 2.600 5 0 8-2.600-3-2-5.500 0-8zM12 12c-.5-3-3-5-7-5 0 4 2 7 7 8M12 12c.5-3 3-5 7-5 0 4-2 7-7 8M3 14c3 0 6 2 9 6 3-4 6-6 9-6" />
);
