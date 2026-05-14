import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0C",
          soft: "#1A1A1C",
          muted: "#5B5B5F",
        },
        bone: {
          DEFAULT: "#F7F4EE",
          soft: "#FBF9F4",
          deep: "#EDE7DA",
        },
        gold: {
          50: "#FBF7EC",
          100: "#F2E7C6",
          200: "#E6D194",
          300: "#D6B65A",
          400: "#C39A2A",
          500: "#A98220",
          600: "#85661B",
        },
        signal: {
          ok: "#1F7A3F",
          warn: "#A8651A",
          err: "#A5252B",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,11,12,0.04), 0 8px 24px rgba(11,11,12,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
