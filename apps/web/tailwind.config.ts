import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0e14",
        panel: "#11161f",
        edge: "#1e2733",
        accent: "#22d3ee",
        signal: "#34d399",
        warn: "#fbbf24",
        danger: "#f87171",
      },
    },
  },
  plugins: [],
};

export default config;
