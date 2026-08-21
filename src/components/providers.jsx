"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";

const ThemeContext = React.createContext({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return React.useContext(ThemeContext);
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState("light");

  // The class was already applied pre-paint by the inline script in the
  // root layout — here we just adopt whatever is on <html>.
  React.useEffect(() => {
    const applied = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    setTheme(applied);
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
        <PwaRegister />
      </ThemeProvider>
    </SessionProvider>
  );
}
