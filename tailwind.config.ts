import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色（primary）- 抹茶綠色系（主要使用）
        primary: {
          50: "#F1F8E9",
          100: "#DCEDC8",
          200: "#C5E1A5",
          300: "#AED581",
          400: "#9CCC65",
          500: "#8BC34A",
          600: "#7CB342",
          700: "#689F38",
        },
        // 輔色（secondary）- 深灰黑（側邊欄、深色卡片）
        secondary: {
          DEFAULT: "#2C2C2E",
          light: "#48484A",
          dark: "#1C1C1E",
        },
        // 強調色（accent）- 柔和紫（小 badge、點綴）
        accent: {
          DEFAULT: "#8B7FD9",
          light: "#A99FE5",
          dark: "#6B5FC7",
        },
        // 黃色（warning）- 數據標籤
        warning: {
          DEFAULT: "#FACC15",
          light: "#FDE68A",
          dark: "#F59E0B",
        },
        // 成功色（success）
        success: {
          DEFAULT: "#4CAF50",
          light: "#81C784",
        },
        // 背景（background）
        background: {
          DEFAULT: "#F5F5F0",
          card: "#FFFFFF",
          dark: "#2C2C2E",
        },
        // 文字（text）
        text: {
          primary: "#2C2C2E",
          secondary: "#757575",
          light: "#FFFFFF",
        },
        // 保留原有的 CSS 變數支援
        foreground: "var(--foreground)",
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "40px",
        "3xl": "64px",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "cat-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
        "cat-blink": {
          "0%, 98%, 100%": { transform: "scaleY(1)" },
          "99%": { transform: "scaleY(0.1)" },
        },
      },
      animation: {
        "gradient-shift": "gradient-shift 15s ease infinite",
        float: "float 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "cat-breathe": "cat-breathe 3s ease-in-out infinite",
        "cat-blink": "cat-blink 10s ease-in-out infinite",
      },
      boxShadow: {
        // 陰影保持柔和
        soft: "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)",
        card: "0 4px 12px rgba(0, 0, 0, 0.08)",
        lg: "0 8px 24px rgba(0, 0, 0, 0.12)",
        // 發光效果
        "glow-sm": "0 0 10px rgba(197, 225, 165, 0.5)",
        "glow-md": "0 0 20px rgba(197, 225, 165, 0.6)",
        "glow-lg": "0 0 30px rgba(197, 225, 165, 0.7)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.15)",
      },
      borderRadius: {
        sm: "12px",
        DEFAULT: "16px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
      },
    },
  },
  plugins: [
    function ({ addUtilities }: any) {
      addUtilities({
        ".glass": {
          background: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        },
        ".glass-strong": {
          background: "rgba(255, 255, 255, 0.15)",
          backdropFilter: "blur(30px)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
        },
      });
    },
  ],
};
export default config;

