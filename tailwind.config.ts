import type { Config } from "tailwindcss";

/**
 * Light mode only. One restrained accent colour (ink blue) on a near-white
 * neutral ground. No gradients, no decorative motion.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        canvas: "#FAFAFA",
        ink: {
          DEFAULT: "#18181B",
          muted: "#52525B",
          faint: "#8A8A93",
        },
        line: {
          DEFAULT: "#E4E4E7",
          strong: "#C9C9CF",
        },
        accent: {
          DEFAULT: "#1D4ED8",
          soft: "#EFF4FF",
          line: "#BFD0F5",
        },
        goal: {
          DEFAULT: "#047857",
          soft: "#ECFDF5",
          line: "#A7E3CB",
        },
        warn: {
          DEFAULT: "#92400E",
          soft: "#FEF6E7",
          line: "#EBD4A8",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
