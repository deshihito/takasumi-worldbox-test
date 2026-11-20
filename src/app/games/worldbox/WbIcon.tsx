import type { CSSProperties } from "react";

export type WbIconName =
  | "map"
  | "pin"
  | "mine"
  | "compass"
  | "target"
  | "city"
  | "town"
  | "home"
  | "shop"
  | "building"
  | "gov"
  | "bank"
  | "cafe"
  | "fountain"
  | "door"
  | "stairs"
  | "factory"
  | "anchor"
  | "race"
  | "drink"
  | "briefcase"
  | "package"
  | "truck"
  | "car"
  | "road"
  | "coins"
  | "card"
  | "chart"
  | "handshake"
  | "receipt"
  | "bell"
  | "bag"
  | "gift"
  | "contract"
  | "swap"
  | "gear"
  | "wrench"
  | "anvil"
  | "pick"
  | "bolt"
  | "hopper"
  | "telescope"
  | "link"
  | "sprout"
  | "scale"
  | "shield"
  | "police"
  | "siren"
  | "lock"
  | "unlock"
  | "keyhole"
  | "bomb"
  | "vent"
  | "alert"
  | "chain"
  | "phone"
  | "hub"
  | "chat"
  | "news"
  | "user"
  | "crown"
  | "vote"
  | "gamepad"
  | "piano"
  | "dice"
  | "trophy"
  | "heart"
  | "heart_pulse"
  | "star"
  | "check"
  | "spy"
  | "scroll"
  | "bar_chart"
  | "send"
  | "inbox"
  | "spade"
  | "club"
  | "suit_diamond"
  | "suit_heart"
  | "slot_orb"
  | "slot_tri"
  | "slot_sq";

interface WbIconProps {
  name: WbIconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function WbIcon({ name, size = 14, color = "currentColor", className, style }: WbIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "-0.16em",
        flexShrink: 0,
        ...style,
      }}
    >
      {renderPath(name, color)}
    </svg>
  );
}

function renderPath(name: WbIconName, color: string) {
  switch (name) {
    case "map":
      return (
        <>
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </>
      );
    case "pin":
      return (
        <>
          <path d="M12 21s-6-5.2-6-11a6 6 0 1 1 12 0c0 5.8-6 11-6 11z" />
          <circle cx="12" cy="10" r="2.2" fill={color} />
        </>
      );
    case "compass":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <polygon points="16 8 13.5 13.5 8 16 10.5 10.5" fill={color} />
        </>
      );
    case "target":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </>
      );
    case "city":
      return (
        <>
          <rect x="3" y="8" width="6" height="13" />
          <rect x="9" y="3" width="6" height="18" />
          <rect x="15" y="10" width="6" height="11" />
          <line x1="12" y1="7" x2="12" y2="7.1" strokeWidth={2.5} />
          <line x1="12" y1="11" x2="12" y2="11.1" strokeWidth={2.5} />
          <line x1="6" y1="12" x2="6" y2="12.1" strokeWidth={2.5} />
          <line x1="18" y1="14" x2="18" y2="14.1" strokeWidth={2.5} />
        </>
      );
    case "town":
      return (
        <>
          <path d="M3 12l5-4 5 4v8H3z" />
          <path d="M13 10l4-3 4 3v10h-8" />
          <rect x="6.5" y="15" width="3" height="5" />
        </>
      );
    case "home":
      return (
        <>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M9.5 20v-6h5v6" />
        </>
      );
    case "shop":
      return (
        <>
          <path d="M3 9l1.5-5h15L21 9" />
          <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
          <path d="M5 12v8h14v-8" />
          <rect x="9" y="14" width="6" height="6" />
        </>
      );
    case "building":
      return (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <line x1="9" y1="7" x2="10" y2="7" />
          <line x1="14" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="10" y2="11" />
          <line x1="14" y1="11" x2="15" y2="11" />
          <path d="M10 21v-5h4v5" />
        </>
      );
    case "gov":
      return (
        <>
          <polygon points="12 3 3 8 21 8" />
          <line x1="6" y1="8" x2="6" y2="18" />
          <line x1="10" y1="8" x2="10" y2="18" />
          <line x1="14" y1="8" x2="14" y2="18" />
          <line x1="18" y1="8" x2="18" y2="18" />
          <line x1="3" y1="18" x2="21" y2="18" />
          <line x1="2" y1="21" x2="22" y2="21" />
        </>
      );
    case "bank":
      return (
        <>
          <polygon points="12 3 2 8 22 8" />
          <line x1="5" y1="8" x2="5" y2="17" />
          <line x1="12" y1="8" x2="12" y2="17" />
          <line x1="19" y1="8" x2="19" y2="17" />
          <rect x="3" y="17" width="18" height="3" />
        </>
      );
    case "cafe":
      return (
        <>
          <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
          <path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2" />
          <line x1="7" y1="4" x2="7" y2="6" />
          <line x1="10.5" y1="3" x2="10.5" y2="6" />
          <line x1="14" y1="4" x2="14" y2="6" />
        </>
      );
    case "fountain":
      return (
        <>
          <path d="M4 17h16c0 2.5-3 4-8 4s-8-1.5-8-4z" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <path d="M12 7c-2-3-6-3-7 1" />
          <path d="M12 7c2-3 6-3 7 1" />
        </>
      );
    case "door":
      return (
        <>
          <rect x="6" y="3" width="12" height="18" rx="1" />
          <circle cx="14.5" cy="12" r="1" fill={color} />
          <line x1="4" y1="21" x2="20" y2="21" />
        </>
      );
    case "stairs":
      return (
        <>
          <path d="M4 20h4v-4h4v-4h4V8h4V4" />
          <line x1="4" y1="20" x2="20" y2="20" />
        </>
      );
    case "factory":
      return (
        <>
          <path d="M3 21V11l6 4v-4l6 4V4h6v17H3z" />
          <line x1="7" y1="17" x2="9" y2="17" />
          <line x1="13" y1="17" x2="15" y2="17" />
        </>
      );
    case "anchor":
      return (
        <>
          <circle cx="12" cy="5" r="2" />
          <line x1="12" y1="7" x2="12" y2="21" />
          <line x1="7" y1="10" x2="17" y2="10" />
          <path d="M5 14a7 7 0 0 0 14 0" />
        </>
      );
    case "race":
      return (
        <>
          <path d="M5 20V4" />
          <path d="M5 5h13l-2.5 4 2.5 4H5" />
          <line x1="9" y1="5" x2="9" y2="13" />
          <line x1="13" y1="5" x2="13" y2="13" />
        </>
      );
    case "drink":
      return (
        <>
          <path d="M5 4h14l-7 8-7-8z" />
          <line x1="12" y1="12" x2="12" y2="20" />
          <line x1="8" y1="20" x2="16" y2="20" />
        </>
      );
    case "briefcase":
      return (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </>
      );
    case "package":
      return (
        <>
          <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
          <polyline points="21 7 12 12 3 7" />
          <line x1="16.5" y1="4.5" x2="7.5" y2="9.5" />
        </>
      );
    case "truck":
      return (
        <>
          <rect x="2" y="7" width="13" height="10" rx="1" />
          <path d="M15 10h4l3 3v4h-7v-7z" />
          <circle cx="6.5" cy="18" r="2" />
          <circle cx="18.5" cy="18" r="2" />
        </>
      );
    case "car":
      return (
        <>
          <path d="M5 11l2-5h10l2 5" />
          <rect x="3" y="11" width="18" height="6" rx="1.5" />
          <circle cx="7" cy="18" r="1.8" />
          <circle cx="17" cy="18" r="1.8" />
        </>
      );
    case "road":
      return (
        <>
          <path d="M7 3L3 21" />
          <path d="M17 3l4 18" />
          <line x1="12" y1="5" x2="12" y2="8" />
          <line x1="12" y1="11" x2="12" y2="14" />
          <line x1="12" y1="17" x2="12" y2="20" />
        </>
      );
    case "coins":
      return (
        <>
          <ellipse cx="10" cy="8" rx="6" ry="3" />
          <path d="M4 8v6c0 1.7 2.7 3 6 3s6-1.3 6-3V8" />
          <path d="M16 11c2.2.4 4 1.5 4 2.8V18c0 1.5-2.5 2.7-5.5 2.9" />
        </>
      );
    case "card":
      return (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="11" y2="15" />
        </>
      );
    case "chart":
      return (
        <>
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="15 7 21 7 21 13" />
          <line x1="3" y1="20" x2="21" y2="20" />
        </>
      );
    case "handshake":
      return (
        <>
          <path d="M3 12l4-4 5 5-4 4z" />
          <path d="M21 12l-4-4-5 5 4 4z" />
          <path d="M9 17l3 3 3-3" />
        </>
      );
    case "receipt":
      return (
        <>
          <path d="M5 3h14v18l-2.5-1.8L14 21l-2-1.8L10 21l-2.5-1.8L5 21V3z" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="12" y2="16" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </>
      );
    case "bag":
      return (
        <>
          <path d="M5 8h14l-1.5 13h-11L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </>
      );
    case "gift":
      return (
        <>
          <rect x="3" y="8" width="18" height="4" />
          <rect x="4" y="12" width="16" height="9" />
          <line x1="12" y1="8" x2="12" y2="21" />
          <path d="M12 8c-1.5-3-5-3-5-.5S10 8 12 8z" />
          <path d="M12 8c1.5-3 5-3 5-.5S14 8 12 8z" />
        </>
      );
    case "contract":
      return (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="15" x2="13" y2="15" />
        </>
      );
    case "swap":
      return (
        <>
          <polyline points="16 3 20 7 16 11" />
          <line x1="4" y1="7" x2="20" y2="7" />
          <polyline points="8 13 4 17 8 21" />
          <line x1="20" y1="17" x2="4" y2="17" />
        </>
      );
    case "gear":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
          <circle cx="12" cy="12" r="6.5" strokeDasharray="3 2.2" />
        </>
      );
    case "wrench":
      return (
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z" />
      );
    case "anvil":
      return (
        <>
          <path d="M3 8h15l3 3-3 2h-4l2 5H6l2-5H4L3 8z" />
          <line x1="4" y1="20" x2="20" y2="20" />
        </>
      );
    case "mine":
    case "pick":
      return (
        <>
          <path d="M5 7c4-3 10-3 14 2" />
          <line x1="14" y1="6" x2="4" y2="20" />
        </>
      );
    case "bolt":
      return <polygon points="13 2 4 14 11 14 10 22 20 10 13 10" />;
    case "hopper":
      return (
        <>
          <path d="M4 4h16l-6 9v6l-4 2v-8L4 4z" />
        </>
      );
    case "telescope":
      return (
        <>
          <line x1="4" y1="12" x2="18" y2="5" strokeWidth={2.4} />
          <line x1="11" y1="10" x2="7" y2="21" />
          <line x1="11" y1="10" x2="15" y2="21" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M10 14a4 4 0 0 1 0-6l2-2a4 4 0 0 1 6 6l-1 1" />
          <path d="M14 10a4 4 0 0 1 0 6l-2 2a4 4 0 0 1-6-6l1-1" />
        </>
      );
    case "sprout":
      return (
        <>
          <line x1="12" y1="20" x2="12" y2="10" />
          <path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z" />
          <path d="M12 15c0-3-3-6-7-6 0 3 3 6 7 6z" />
        </>
      );
    case "scale":
      return (
        <>
          <line x1="12" y1="3" x2="12" y2="20" />
          <line x1="6" y1="20" x2="18" y2="20" />
          <line x1="4" y1="7" x2="20" y2="7" />
          <path d="M4 7l-2 6h6L6 7z" />
          <path d="M18 7l-2 6h6l-2-6z" />
        </>
      );
    case "shield":
      return <path d="M12 3l7 3v5c0 4.8-3 8.5-7 10-4-1.5-7-5.2-7-10V6l7-3z" />;
    case "police":
      return (
        <>
          <rect x="4" y="10" width="16" height="7" rx="1.5" />
          <path d="M6 10l2-4h8l2 4" />
          <rect x="10" y="3" width="4" height="3" fill={color} />
          <circle cx="7.5" cy="18" r="1.6" />
          <circle cx="16.5" cy="18" r="1.6" />
        </>
      );
    case "siren":
      return (
        <>
          <path d="M7 16v-4a5 5 0 0 1 10 0v4" />
          <line x1="4" y1="19" x2="20" y2="19" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="4" y1="6" x2="6" y2="8" />
          <line x1="20" y1="6" x2="18" y2="8" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );
    case "unlock":
      return (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 7.6-1.6" />
        </>
      );
    case "keyhole":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="12" cy="10" r="2" fill={color} />
          <path d="M11 12l-1 4h4l-1-4" fill={color} />
        </>
      );
    case "bomb":
      return (
        <>
          <circle cx="10" cy="14" r="6" />
          <path d="M14.5 9.5L17 7l3-1" />
          <line x1="19" y1="3" x2="20" y2="5" />
          <line x1="21" y1="8" x2="22" y2="9" />
        </>
      );
    case "vent":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <line x1="6" y1="9" x2="18" y2="9" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="6" y1="15" x2="18" y2="15" />
        </>
      );
    case "alert":
      return (
        <>
          <polygon points="12 3 2 20 22 20" />
          <line x1="12" y1="9" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.8" fill={color} />
        </>
      );
    case "chain":
      return (
        <>
          <rect x="3" y="9" width="7" height="6" rx="3" />
          <rect x="14" y="9" width="7" height="6" rx="3" />
          <line x1="8.5" y1="12" x2="15.5" y2="12" />
        </>
      );
    case "phone":
      return (
        <>
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <line x1="10" y1="18" x2="14" y2="18" />
        </>
      );
    case "hub":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      );
    case "chat":
      return (
        <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      );
    case "news":
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="7" y1="9" x2="13" y2="9" />
          <line x1="7" y1="13" x2="17" y2="13" />
          <line x1="7" y1="16" x2="15" y2="16" />
        </>
      );
    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      );
    case "crown":
      return (
        <>
          <path d="M3 18l2-11 4 4 3-6 3 6 4-4 2 11H3z" />
        </>
      );
    case "vote":
      return (
        <>
          <rect x="4" y="11" width="16" height="9" rx="1.5" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <rect x="9" y="4" width="6" height="7" />
        </>
      );
    case "gamepad":
      return (
        <>
          <rect x="3" y="7" width="18" height="11" rx="4" />
          <line x1="8" y1="10" x2="8" y2="15" />
          <line x1="5.5" y1="12.5" x2="10.5" y2="12.5" />
          <circle cx="15.5" cy="11" r="1" fill={color} />
          <circle cx="17.5" cy="14" r="1" fill={color} />
        </>
      );
    case "piano":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <line x1="8" y1="5" x2="8" y2="19" />
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="16" y1="5" x2="16" y2="19" />
          <rect x="6.5" y="5" width="3" height="8" fill={color} />
          <rect x="14.5" y="5" width="3" height="8" fill={color} />
        </>
      );
    case "dice":
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <circle cx="9" cy="9" r="1" fill={color} />
          <circle cx="15" cy="9" r="1" fill={color} />
          <circle cx="12" cy="12" r="1" fill={color} />
          <circle cx="9" cy="15" r="1" fill={color} />
          <circle cx="15" cy="15" r="1" fill={color} />
        </>
      );
    case "trophy":
      return (
        <>
          <path d="M6 4h12v6a6 6 0 0 1-12 0V4z" />
          <path d="M6 6H3v3a3 3 0 0 0 3 3" />
          <path d="M18 6h3v3a3 3 0 0 1-3 3" />
          <line x1="12" y1="16" x2="12" y2="20" />
          <line x1="8" y1="20" x2="16" y2="20" />
        </>
      );
    case "heart":
      return <path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />;
    case "heart_pulse":
      return (
        <>
          <path d="M3 12h4l2.5-5 4 10 2.5-5H21" />
        </>
      );
    case "star":
      return (
        <polygon
          points="12 3 14.9 8.8 21 9.7 16.5 14 17.6 20 12 17.1 6.4 20 7.5 14 3 9.7 9.1 8.8"
          fill={color}
        />
      );
    case "check":
      return <polyline points="4 12 10 18 20 6" />;
    case "spy":
      return (
        <>
          <circle cx="8" cy="13" r="3" />
          <circle cx="16" cy="13" r="3" />
          <line x1="11" y1="13" x2="13" y2="13" />
          <path d="M4 9l8-4 8 4" />
        </>
      );
    case "scroll":
      return (
        <>
          <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <line x1="8" y1="9" x2="16" y2="9" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </>
      );
    case "bar_chart":
      return (
        <>
          <line x1="6" y1="19" x2="6" y2="12" strokeWidth={2.5} />
          <line x1="12" y1="19" x2="12" y2="6" strokeWidth={2.5} />
          <line x1="18" y1="19" x2="18" y2="9" strokeWidth={2.5} />
          <line x1="3" y1="20" x2="21" y2="20" />
        </>
      );
    case "send":
      return (
        <>
          <polygon points="22 2 11 13 15 22 22 2" />
          <polygon points="22 2 2 9 11 13" />
        </>
      );
    case "inbox":
      return (
        <>
          <polyline points="4 13 4 19 20 19 20 13" />
          <polyline points="8 11 12 15 16 11" />
          <line x1="12" y1="4" x2="12" y2="15" />
        </>
      );
    case "spade":
      return (
        <>
          <path
            d="M12 3c4 4.5 7 7.5 7 11a4 4 0 0 1-7 2.6A4 4 0 0 1 5 14c0-3.5 3-6.5 7-11z"
            fill={color}
          />
          <path d="M12 16l-2.5 5h5L12 16z" fill={color} />
        </>
      );
    case "club":
      return (
        <>
          <circle cx="12" cy="7.5" r="3.6" fill={color} />
          <circle cx="7.5" cy="13.5" r="3.5" fill={color} />
          <circle cx="16.5" cy="13.5" r="3.5" fill={color} />
          <path d="M12 14l-2.5 7h5L12 14z" fill={color} />
        </>
      );
    case "suit_diamond":
      return <polygon points="12 2 20 12 12 22 4 12" fill={color} />;
    case "suit_heart":
      return (
        <path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" fill={color} />
      );
    case "slot_orb":
      return <circle cx="12" cy="12" r="7" fill={color} />;
    case "slot_tri":
      return <polygon points="12 4 20 19 4 19" fill={color} />;
    case "slot_sq":
      return <rect x="5" y="5" width="14" height="14" rx="2" fill={color} />;
  }
}

export function drawCanvasPinGlyph(
  ctx: CanvasRenderingContext2D,
  kind: "pin" | "home" | "mine" | "city" | "shop" | "star",
  x: number,
  y: number,
  radius: number,
  fill: string,
) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = fill;
  ctx.lineWidth = 1.4;
  if (kind === "home") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y - radius * 0.1);
    ctx.lineTo(x + radius * 0.72, y + radius * 0.85);
    ctx.lineTo(x - radius * 0.72, y + radius * 0.85);
    ctx.lineTo(x - radius, y - radius * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === "mine") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === "city") {
    const r = radius * 0.88;
    ctx.beginPath();
    ctx.rect(x - r, y - r * 0.4, r * 0.8, r * 1.25);
    ctx.rect(x - r * 0.2, y - r, r * 1.05, r * 1.85);
    ctx.fill();
    ctx.stroke();
  } else if (kind === "shop") {
    const r = radius * 0.9;
    ctx.beginPath();
    ctx.rect(x - r, y - r * 0.7, r * 2, r * 1.5);
    ctx.fill();
    ctx.stroke();
  } else if (kind === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const dist = i % 2 === 0 ? radius : radius * 0.45;
      const px = x + Math.cos(ang) * dist;
      const py = y + Math.sin(ang) * dist;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - radius * 0.2, radius * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.4, y + radius * 0.4);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x + radius * 0.4, y + radius * 0.4);
    ctx.fill();
  }
  ctx.restore();
}
