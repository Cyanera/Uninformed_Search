"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cx } from "./ui";

/**
 * The join link as a QR code.
 *
 * Students point a phone camera at the projector and land on the join page with
 * the session code already filled in, so all they type is their name and
 * student ID. The code is still printed underneath: a phone with no camera
 * access, or a student at the back of a long room, must still be able to join.
 */
export function JoinQr({
  code,
  size = 220,
  className,
  showUrl = true,
}: {
  code: string;
  size?: number;
  className?: string;
  showUrl?: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    // The origin is only known in the browser, and it has to be the origin the
    // students will actually reach - not a hard-coded one.
    const joinUrl = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
    setUrl(joinUrl);

    QRCode.toString(joinUrl, {
      type: "svg",
      margin: 0,
      // High correction, because a projected code is often photographed at an
      // angle, half-lit, or partly blocked by someone's head.
      errorCorrectionLevel: "H",
      color: { dark: "#18181B", light: "#FFFFFF" },
    })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [code]);

  return (
    <div className={cx("flex flex-col items-center gap-2", className)}>
      <div
        className="rounded border border-line bg-white p-2"
        style={{ width: size, height: size }}
        aria-hidden
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      {showUrl && url && (
        <p className="max-w-full break-all text-center text-xs text-ink-muted">
          {url.replace(/^https?:\/\//, "")}
        </p>
      )}
      <p className="sr-only">
        Scan to join session {code}, or go to {url}
      </p>
    </div>
  );
}

/** Full-screen QR for projecting. Nothing else on the screen competes with it. */
export function JoinQrProjector({ code, onClose }: { code: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper p-6">
      <p className="text-lg font-medium uppercase tracking-wide text-ink-muted">Scan to join</p>

      <div className="my-6 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-10">
        <JoinQr code={code} size={380} showUrl={false} />
        <div className="text-center sm:text-left">
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            Or type the code
          </p>
          <p className="font-mono text-7xl font-semibold tracking-[0.15em] sm:text-8xl">{code}</p>
          <p className="mt-3 text-lg text-ink-muted">
            at <span className="font-semibold text-ink">{typeof window !== "undefined" ? window.location.host : ""}/join</span>
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="min-h-[52px] rounded border border-line-strong bg-paper px-6 text-base font-medium hover:bg-canvas"
      >
        Close (Esc)
      </button>
    </div>
  );
}
