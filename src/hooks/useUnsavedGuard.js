import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Warns the user when they try to leave (close tab / refresh) while changes
 * are unsaved, and intercepts in-app SPA navigation by patching the History API.
 */
export function useUnsavedGuard(dirty) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [pendingHref, setPendingHref] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  // Browser close / refresh
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Patch history.pushState / replaceState + popstate to intercept SPA nav
  useEffect(() => {
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);

    const intercept = (orig) =>
      function (...args) {
        const url = args[2];
        if (dirtyRef.current && url && typeof url === "string") {
          setPendingHref(url);
          setPendingAction(() => () => orig(...args));
          return;
        }
        return orig(...args);
      };

    window.history.pushState = intercept(origPush);
    window.history.replaceState = intercept(origReplace);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  const confirmPending = useCallback(() => {
    pendingAction?.();
    setPendingAction(null);
    setPendingHref(null);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [pendingAction]);

  const cancelPending = useCallback(() => {
    setPendingAction(null);
    setPendingHref(null);
  }, []);

  const guardedRun = useCallback((action) => {
    if (dirtyRef.current) {
      setPendingHref("this action");
      setPendingAction(() => action);
    } else {
      action();
    }
  }, []);

  return { pendingHref, confirmPending, cancelPending, guardedRun };
}
