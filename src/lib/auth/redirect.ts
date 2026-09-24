/** Keep login and email callbacks on this application, including URL edge cases. */
export function safeInternalRedirect(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return "/account";
  }
  const origin = "https://getgold.invalid";
  try {
    const destination = new URL(value, origin);
    return destination.origin === origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/account";
  } catch {
    return "/account";
  }
}
