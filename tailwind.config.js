/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-border": "var(--panel-border)",
        fg: "var(--fg)",
        "fg-dim": "var(--fg-dim)",
        gold: "var(--gold)",
        emerald: "var(--emerald)",
        rust: "var(--rust)",
        blue: "var(--blue)",
        cyan: "var(--cyan)",
        violet: "var(--violet)",
      },
    },
  },
  plugins: [],
};