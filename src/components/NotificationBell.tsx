import Link from "next/link";
export function NotificationBell({
  count,
  arabic = false,
}: {
  count: number;
  arabic?: boolean;
}) {
  return (
    <Link
      href="/account/notifications"
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-jade-950 transition hover:bg-jade-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-jade-700"
      aria-label={
        arabic
          ? `الإشعارات، ${count} غير مقروءة`
          : `Notifications, ${count} unread`
      }
    >
      <svg
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {count > 0 && (
        <span className="absolute end-0 top-0 min-w-4 rounded-full bg-jade-800 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
