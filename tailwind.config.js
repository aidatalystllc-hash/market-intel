/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f6f3ee',
        bg2: '#ffffff',
        bg3: '#f0ece4',
        bg4: '#e6e0d4',
        bd: '#ddd8ce',
        bd2: '#c8c0b0',
        tx: '#1c1814',
        tx2: '#6b6258',
        tx3: '#9e9488',
        nat: '#b03a1a',
        reg: '#1a4f96',
        loc: '#1a7040',
        pe: '#7a1050',
        acc: '#b07d10',
        acc2: '#d4a020',
      },
      fontFamily: {
        display: ["'Playfair Display'", 'Georgia', 'serif'],
        sans: ["'Syne'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.07), 0 4px 14px rgba(0,0,0,0.05)',
        panel: '0 2px 8px rgba(0,0,0,0.09), 0 12px 36px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
