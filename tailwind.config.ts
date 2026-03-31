import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        night: "#07111f",
        ink: "#0f1d33",
        mist: "#9ab0c9",
        lime: "#b4ff62",
        coral: "#ff8a5b",
        sky: "#52c8ff"
      },
      boxShadow: {
        card: "0 24px 80px rgba(0, 0, 0, 0.35)"
      },
      backgroundImage: {
        "city-grid":
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
