export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "cabinet",
    items: [
      { href: "/", label: "dashboard", icon: "dashboard" },
      { href: "/agenda", label: "agenda", icon: "calendar" },
      { href: "/patients", label: "patients", icon: "patients" },
      { href: "/consultations", label: "consultations", icon: "clipboard" },
      { href: "/odontogram", label: "odontogram", icon: "tooth" },
      { href: "/treatments", label: "treatments", icon: "activity" },
    ],
  },
  {
    title: "management",
    items: [
      { href: "/quotes", label: "quotes", icon: "file" },
      { href: "/invoices", label: "invoices", icon: "receipt" },
      { href: "/treasury", label: "treasury", icon: "wallet" },
    ],
  },
  {
    title: "workspace",
    items: [
      { href: "/laboratory", label: "laboratory", icon: "flask" },
      { href: "/stock", label: "stock", icon: "package" },
      { href: "/suppliers", label: "suppliers", icon: "truck" },
      { href: "/reports", label: "reports", icon: "chart" },
      { href: "/team", label: "team", icon: "patients" },
      { href: "/settings", label: "settings", icon: "settings" },
    ],
  },

 
];
