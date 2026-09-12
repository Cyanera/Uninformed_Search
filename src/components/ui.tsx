"use client";

import React from "react";

/**
 * A very small set of primitives. Minimal, academic, light mode only:
 * flat surfaces, one accent colour, hairline borders, generous whitespace.
 * Touch targets are at least 44px so the student page works on a phone.
 */

type ClassValue = string | false | null | undefined | 0;

export function cx(...parts: ClassValue[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white border-accent hover:bg-[#1A43BE] disabled:bg-[#A9BEEC] disabled:border-[#A9BEEC]",
  secondary: "bg-paper text-ink border-line-strong hover:bg-canvas disabled:text-ink-faint",
  quiet: "bg-transparent text-ink-muted border-transparent hover:bg-canvas hover:text-ink",
  danger: "bg-paper text-[#B42318] border-[#E7B7B2] hover:bg-[#FEF3F2] disabled:text-ink-faint",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 text-sm",
  md: "min-h-[44px] px-4 text-sm",
  lg: "min-h-[52px] px-5 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded border font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded border border-line bg-paper", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full min-h-[44px] rounded border border-line-strong bg-paper px-3 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, "pr-8", props.className)} />;
}

type Tone = "neutral" | "accent" | "goal" | "warn" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-canvas text-ink-muted",
  accent: "border-accent-line bg-accent-soft text-accent",
  goal: "border-goal-line bg-goal-soft text-goal",
  warn: "border-warn-line bg-warn-soft text-warn",
  muted: "border-line bg-paper text-ink-faint",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cx("rounded border px-3 py-2 text-sm", TONES[tone])} role="status">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: { id: T; label: string; badge?: React.ReactNode }[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cx(
              "-mb-px inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              selected
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Screen-reader-only text: correctness must never be conveyed by colour alone. */
export function SrOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span
        aria-hidden
        className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      />
      {label}
    </span>
  );
}
