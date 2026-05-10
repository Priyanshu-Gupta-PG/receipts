/** @type {import('tailwindcss').Config} */
const rgb = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: rgb("bg-primary"),
          secondary: rgb("bg-secondary"),
          tertiary: rgb("bg-tertiary"),
        },
        border: {
          DEFAULT: rgb("border-default"),
          muted: rgb("border-muted"),
        },
        text: {
          primary: rgb("text-primary"),
          secondary: rgb("text-secondary"),
          muted: rgb("text-muted"),
        },
        accent: {
          red: rgb("accent-red"),
          green: rgb("accent-green"),
          amber: rgb("accent-amber"),
          blue: rgb("accent-blue"),
          violet: rgb("accent-violet"),
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
