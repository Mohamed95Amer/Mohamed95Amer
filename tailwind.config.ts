import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#102923",
          soft: "#20453D",
          muted: "#61756F",
        },
        bone: {
          DEFAULT: "#F4EFE4",
          soft: "#FCFAF5",
          deep: "#DDD5C7",
        },
        jade: {
          50: "#EFF8F4",
          100: "#D8EEE5",
          200: "#AFDCCA",
          300: "#78C1A6",
          400: "#45A181",
          500: "#277F64",
          600: "#17654F",
          700: "#104E3F",
          800: "#0B3C32",
          900: "#072F28",
          950: "#041F1B",
        },
        gold: {
          50: "#FFF9E8",
          100: "#FBECC0",
          200: "#F4D984",
          300: "#E9BD50",
          400: "#D69B2D",
          500: "#B97820",
          600: "#8F591B",
        },
        signal: {
          ok: "#16845F",
          warn: "#B56C1D",
          err: "#B43B49",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 2px 4px rgba(7,47,40,0.04), 0 18px 48px rgba(7,47,40,0.08)",
        lift: "0 20px 60px rgba(4,31,27,0.16)",
        glow: "0 0 0 1px rgba(233,189,80,0.18), 0 24px 80px rgba(4,31,27,0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
