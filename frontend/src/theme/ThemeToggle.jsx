import { Sun, Moon } from "lucide-react";
import { useTheme } from "./useTheme";

export default function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";
  const knobTranslate = isDark ? 48 : 6;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="relative inline-flex items-center select-none h-11 w-24 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 shadow-sm backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors motion-safe:duration-200"
    >
      <span aria-hidden className={`absolute inset-0 rounded-full pointer-events-none transition-opacity motion-safe:duration-200`}
        style={{
          background: isDark
            ? "linear-gradient(90deg, rgba(59, 48, 146,0.12), rgba(139, 92, 246,0.06))"
            : "linear-gradient(90deg, rgba(255, 183, 77,0.09), rgba(34,197,94,0.04))",
        }} />
      <div className="absolute inset-0 px-3 grid grid-cols-2 items-center text-gray-700 dark:text-gray-200 pointer-events-none">
        <div className="flex justify-start"><Sun size={18} className={`${isDark ? "opacity-60" : "opacity-100"} transition-opacity`} /></div>
        <div className="flex justify-end"><Moon size={18} className={`${isDark ? "opacity-100" : "opacity-60"} transition-opacity`} /></div>
      </div>
      <span aria-hidden style={{ transform: `translateX(${knobTranslate}px) translateY(-50%)` }}
        className="absolute top-1/2 h-9 w-9 rounded-full shadow bg-black/5 dark:bg-white/20 ring-1 ring-black/10 dark:ring-white/10 transition-transform motion-safe:duration-200" />
      <span className="sr-only">{isDark ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
