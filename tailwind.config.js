/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: '#ffffff',
        line: '#e2e8f0',
        ink: '#0b1410',
        // Palette noir et gris (l'appli n'a plus de vert).
        brand: {
          50: '#18181b',
          100: '#1f1f23',
          200: '#2a2a30',
          300: '#44444c',
          400: '#a1a1aa',
          500: '#e4e4e7',
          600: '#f4f4f5',
          700: '#d4d4d8',
          800: '#a1a1aa',
          900: '#09090b',
        },
      },
      boxShadow: {
        panel: '0 24px 60px -28px rgba(0, 0, 0, 0.55)',
        soft: '0 10px 30px -12px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [],
};
