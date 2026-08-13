"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type AccentColor = "gold" | "violet";
export type VisualTheme = "dark" | "night";

interface ThemeContextProps {
  accent: AccentColor;
  theme: VisualTheme;
  isViolet: boolean;
  setAccent: (accent: AccentColor) => void;
  setTheme: (theme: VisualTheme) => void;
}

const ThemeContext = createContext<ThemeContextProps>({
  accent: "gold",
  theme: "dark",
  isViolet: false,
  setAccent: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>("gold");
  const [theme, setThemeState] = useState<VisualTheme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedAccent = localStorage.getItem("accent") as AccentColor;
    const savedTheme = localStorage.getItem("theme") as VisualTheme;
    if (savedAccent) setAccentState(savedAccent);
    if (savedTheme) setThemeState(savedTheme);
    setMounted(true);
  }, []);

  const setAccent = (val: AccentColor) => {
    setAccentState(val);
    localStorage.setItem("accent", val);
  };

  const setTheme = (val: VisualTheme) => {
    setThemeState(val);
    localStorage.setItem("theme", val);
  };

  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    if (!body) return;

    if (theme === "night") {
      body.style.backgroundColor = "#030406";
    } else {
      body.style.backgroundColor = "#08090B";
    }

    if (accent === "violet") {
      body.classList.add("accent-violet");
    } else {
      body.classList.remove("accent-violet");
    }
  }, [accent, theme, mounted]);

  return (
    <ThemeContext.Provider value={{ accent, theme, isViolet: accent === "violet", setAccent, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useAccentStyles = () => {
  const { accent } = useTheme();
  const isViolet = accent === "violet";

  return {
    isViolet,
    text: isViolet ? "text-[#CFC3FF]" : "text-[#E2C48D]",
    border: isViolet ? "border-[#7A5AF8]" : "border-[#C7A66B]",
    borderAlpha: isViolet ? "border-[#7A5AF8]/25" : "border-[#C7A66B]/25",
    borderHover: isViolet ? "hover:border-[#CFC3FF]/45" : "hover:border-[#E2C48D]/40",
    bg: isViolet ? "bg-[#7A5AF8]" : "bg-[#C7A66B]",
    bgAlpha: isViolet ? "bg-[#7A5AF8]/15" : "bg-[#C7A66B]/15",
    bgHover: isViolet ? "hover:bg-[#CFC3FF]" : "hover:bg-[#E2C48D]",
    shadow: isViolet ? "hover:shadow-[0_8px_30px_rgba(122,90,248,0.35)]" : "hover:shadow-[0_8px_30px_rgba(199,166,107,0.35)]",
    accentGlow: isViolet ? "rgba(122,90,248,0.12)" : "rgba(226,196,141,0.12)",
    accentTextGlow: isViolet ? "shadow-[0_0_15px_rgba(122,90,248,0.3)]" : "shadow-[0_0_15px_rgba(226,196,141,0.3)]",
  };
};
