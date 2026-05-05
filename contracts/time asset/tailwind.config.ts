import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        time: {
          background: "#05070A",
          card: "#0B0F14",
          border: "#1A1F2B",
          muted: "#9CA3AF",
          green: "#10B981",
        },
      },
    },
  },
  plugins: [],
};

export default config;
