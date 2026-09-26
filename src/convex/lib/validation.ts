// ---------------------------------------------------------------------------
// Validation helpers shared by Convex functions. Keep these pure so they can
// be unit-tested without a Convex context.
// ---------------------------------------------------------------------------

export const MIN_NAME_LENGTH = 2;
export const MIN_PHONE_DIGITS = 8;
export const MAX_PHONE_DIGITS = 15;

export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: string;
}

export function validateName(raw: string): ValidationResult {
  const name = (raw ?? "").trim();
  if (name.length < MIN_NAME_LENGTH) {
    return { ok: false, error: `Name must be at least ${MIN_NAME_LENGTH} characters.` };
  }
  return { ok: true, value: name };
}

export function validatePhone(raw: string): ValidationResult {
  const phone = normalizePhone(raw ?? "");
  if (!phone) {
    return { ok: false, error: "Phone number is required." };
  }
  if (phone.startsWith("+")) {
    const digits = phone.slice(1);
    if (!/^\d+$/.test(digits)) {
      return { ok: false, error: "Phone number contains invalid characters." };
    }
  } else if (!/^\d+$/.test(phone)) {
    return { ok: false, error: "Phone number contains invalid characters." };
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return {
      ok: false,
      error: `Phone number must contain ${MIN_PHONE_DIGITS}-${MAX_PHONE_DIGITS} digits.`,
    };
  }
  return { ok: true, value: phone };
}

export function optionalText(raw: string | undefined, max = 2000): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  if (!t) return undefined;
  return t.slice(0, max);
}
