/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Base colors - Updated to use new color palette
        border: "hsl(219, 20%, 90%)", // Light blue-gray border
        input: "hsl(0, 0%, 100%)", // White input background
        ring: "hsl(267, 100%, 58%)", // Amethyst ring
        background: "hsl(219, 34%, 98%)", // Very light blue background
        foreground: "hsl(219, 79%, 26%)", // Dark blue text
        
        // Primary - Deep Ocean Blue
        primary: {
          DEFAULT: "hsl(219, 79%, 26%)", // Deep ocean blue
          foreground: "hsl(0, 0%, 98%)", // Royal white text
          light: "hsl(219, 79%, 35%)", // Lighter ocean blue
          dark: "hsl(219, 79%, 20%)", // Darker ocean blue
          muted: "hsl(219, 34%, 95%)", // Very light blue for subtle backgrounds
        },
        
        // Secondary - Vibrant Amethyst
        secondary: {
          DEFAULT: "hsl(267, 100%, 58%)", // Vibrant amethyst
          foreground: "hsl(0, 0%, 100%)", // White text
          light: "hsl(267, 100%, 92%)", // Very light amethyst for hover states
          dark: "hsl(267, 100%, 45%)", // Darker amethyst for active states
        },
        
        // Accent - Royal White
        accent: {
          DEFAULT: "hsl(0, 0%, 98%)", // Royal white
          foreground: "hsl(219, 79%, 26%)", // Dark blue text
          light: "hsl(0, 0%, 100%)", // Pure white
          dark: "hsl(0, 0%, 95%)", // Slightly off-white
        },
        
        // Backgrounds
        background: {
          DEFAULT: "hsl(219, 34%, 98%)", // Very light blue
          foreground: "hsl(219, 79%, 26%)", // Dark blue text
          alt: "hsl(0, 0%, 100%)", // Pure white for cards/sections
        },
        
        // Cards
        card: {
          DEFAULT: "hsl(0, 0%, 100%)", // Pure white
          foreground: "hsl(219, 79%, 26%)", // Dark blue text
          border: "hsl(219, 20%, 90%)", // Light border
          hover: "hsl(219, 34%, 98%)", // Very light blue on hover
        },
        
        // Destructive - Keeping red for errors/danger
        destructive: {
          DEFAULT: "hsl(0, 84%, 60%)", // Red
          foreground: "hsl(0, 0%, 100%)", // White text
          light: "hsl(0, 84%, 95%)", // Very light red for backgrounds
          dark: "hsl(0, 84%, 50%)", // Darker red for hover/active
        },
        
        // Muted - For secondary text and subtle UI elements
        muted: {
          DEFAULT: "hsl(219, 16%, 96%)", // Very light blue-gray
          foreground: "hsl(215, 16%, 47%)", // Muted blue-gray text
          border: "hsl(219, 20%, 90%)", // Light border
        },
        
        // Popover - For dropdowns, tooltips, etc.
        popover: {
          DEFAULT: "hsl(0, 0%, 100%)", // White
          foreground: "hsl(219, 79%, 26%)", // Dark blue text
          border: "hsl(219, 20%, 90%)", // Light border
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
