import type { CSSProperties, ReactNode } from "react";

type IconProps = { name: string; size?: number; strokeWidth?: number; className?: string; style?: CSSProperties };

const shapes: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  patients: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6a1.5 1.5 0 0 0-3-1.5 1.5 1.5 0 0 0-3 1.5ZM8 11h8M8 15h6"/></>,
  tooth: <><path d="M12 3c-2.1-1.5-6-1-7.7 1.2-2 2.6-.5 7.1.6 10.1 1.2 3.2 1.5 6.7 3.5 6.7 1.8 0 1.5-5.1 3.6-5.1s1.8 5.1 3.6 5.1c2 0 2.3-3.5 3.5-6.7 1.1-3 2.6-7.5.6-10.1C18 2 14.1 1.5 12 3Z"/></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4"/>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4L7.5 15a8 8 0 0 1 0-1.9l-1.4-1.2 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.2a8 8 0 0 1-.1 1.9Z" transform="translate(-1 -1) scale(1.08)"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevronDown: <path d="m7 10 5 5 5-5"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
  arrowRight: <><path d="M5 12h14M12 5l7 7-7 7"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <><path d="m18 6-12 12M6 6l12 12"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  userPlus: <><path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></>,
  edit: <><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></>,
  calendarClock: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/><circle cx="16" cy="16" r="3"/><path d="M16 14.5V16l1 1"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
  receipt: <><path d="M4 3v18l4-2 4 2 4-2 4 2V3l-4 2-4-2-4 2-4-2Z"/><path d="M8 9h8M8 13h5"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 9h18M16 14h2M7 5V3h11"/></>,
  flask: <><path d="M9 3h6M10 3v6l-5.2 8.4A2.4 2.4 0 0 0 6.9 21h10.2a2.4 2.4 0 0 0 2.1-3.6L14 9V3"/><path d="M7.5 15h9"/></>,
  package: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,
  truck: <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></>,
  chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/></>,
  stethoscope: <><path d="M6 3v6a6 6 0 0 0 12 0V3M3 3h6M15 3h6M18 15a4 4 0 1 0 4 4"/></>,
  creditCard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 12h.01"/></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, className, style }: IconProps) {
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] ?? shapes.file}</svg>;
}
