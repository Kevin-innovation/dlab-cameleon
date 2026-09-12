"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AccessibleModal({
  titleId,
  onClose,
  children,
  panelClassName = "max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-[#17241c] p-6 shadow-2xl",
}: {
  titleId: string;
  onClose?: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusable[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!onCloseRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const currentFocusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!currentFocusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      lastFocusedRef.current?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}
