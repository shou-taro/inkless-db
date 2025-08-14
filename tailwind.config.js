/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        /**
         * Lilac‑first brand palette.
         * DEFAULT remains the established lilac (#a78bfa). Additional shades
         * give more headroom for backgrounds, borders and accessible contrasts.
         */
        brandPurple: {
          50: '#f5f3ff', // very soft lilac (better for large surfaces)
          100: '#ede9fe',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c4b5fd',
          500: '#a78bfa', // DEFAULT in previous design (kept for compatibility)
          600: '#8b5cf6', // hover / active on dark text
          700: '#7c3aed',
          800: '#6d28d9',
          900: '#5b21b6',
          DEFAULT: '#a78bfa',
          hover: '#8b5cf6',
        },

        /** Semantic aliases for outline/ghost buttons and subtle accents. */
        brandPurpleOutline: {
          border: '#a78bfa',
          text: '#7c3aed',
          hoverBg: 'rgba(167, 139, 250, 0.10)', // 10% tint for hover feedback
          hoverText: '#7c3aed',
        },

        /**
         * Direct hex codes for JS‑only contexts (e.g. React Flow MiniMap) to
         * avoid keeping duplicate COLOR_* constants around the codebase.
         * These mirror the Tailwind tokens above.
         */
        brandPurpleHex: '#a78bfa',
        brandPurpleHoverHex: '#8b5cf6',
        brandPurple50Hex: '#f5f3ff',
        violet100Hex: '#ede9fe',
        zinc500Hex: '#6b7280',

        /**
         * Neutral surfaces tuned for lilac UI. These track CSS variables so
         * light/dark modes inherit correctly.
         */
        surface: {
          subtle: 'rgba(167, 139, 250, 0.06)',
          tint: 'rgba(167, 139, 250, 0.10)',
        },

        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },

      /**
       * Opinionated gradient presets for lilac‑first layouts. Use via
       * `bg-lilac-hero` or `bg-lilac-hero-soft` on containers.
       */
      backgroundImage: {
        'lilac-hero':
          'radial-gradient(circle at 15% 20%, rgba(199,210,254,0.35), transparent 60%), \
           radial-gradient(circle at 85% 25%, rgba(233,213,255,0.35), transparent 60%), \
           radial-gradient(circle at 30% 80%, rgba(250,232,255,0.30), transparent 60%), \
           radial-gradient(circle at 75% 75%, rgba(219,234,254,0.30), transparent 60%)',
        'lilac-hero-soft':
          'radial-gradient(circle at 20% 15%, rgba(245,243,255,0.70), transparent 55%), \
           radial-gradient(circle at 80% 20%, rgba(232, 213, 255, 0.45), transparent 55%)',
      },

      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },

      boxShadow: {
        brand: '0 8px 24px -8px rgba(124, 58, 237, 0.25)', // subtle lilac lift
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
