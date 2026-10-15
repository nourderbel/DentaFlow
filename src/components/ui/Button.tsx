import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-line bg-white text-slate-600 hover:bg-slate-50",
  danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants };

export function Button({ variant = "secondary", className = "", ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}