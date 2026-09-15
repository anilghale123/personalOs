"use client";

import * as React from "react";

const AppUserContext = React.createContext(null);

/**
 * The signed-in user as the app layout resolved it: `{ id, name, isPro }`.
 *
 * The layout is rendered once and kept across navigations, so screens read
 * the user from here instead of asking the server again on every open.
 */
export function AppUserProvider({ user, children }) {
  return <AppUserContext.Provider value={user}>{children}</AppUserContext.Provider>;
}

/** @returns {{id: string, name?: string, isPro: boolean} | null} */
export function useAppUser() {
  return React.useContext(AppUserContext);
}
