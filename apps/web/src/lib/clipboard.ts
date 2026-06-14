/*
 * Clipboard writes that tell the truth. navigator.clipboard is undefined in non-secure contexts
 * and writeText can reject (permissions policy, focus loss) — for shown-once delegate keys a
 * silently-failed copy followed by a "Copied" toast loses the key forever. Always check the
 * returned boolean before confirming success to the user.
 */

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  // Legacy fallback (non-secure contexts, denied permission): a transient textarea + execCommand.
  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
