/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e6f4ed',
          100: '#c2e3d1',
          200: '#9bd1b3',
          300: '#6dbf93',
          400: '#47b07b',
          500: '#1ea262',
          600: '#15914f', // brand green
          700: '#0a7d3e',
          800: '#006B3F', // deep Nigerian green
          900: '#004d2b',
        },
        gold: {
          400: '#FFD700',
          500: '#F5A623',
          600: '#E09010',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
