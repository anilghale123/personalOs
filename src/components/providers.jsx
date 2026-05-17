"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

const ThemeContext = React.createContext({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState("light");

  React.useEffect(() => {
    const stored = localStorage.getItem("pos-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const initial = stored || (prefersDark ? "dark" : "light");
    setTheme(initial);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("pos-theme", theme);
  }, [theme]);

  const toggleTheme = React.useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function ToastPortal() {
  const { theme } = useTheme();
  return <Toaster richColors position="bottom-right" theme={theme} />;
}

export function Providers({ children }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ToastPortal />
      </ThemeProvider>
    </SessionProvider>
  );
}
