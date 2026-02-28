"use client";

import { FC, ReactNode } from "react";
import { Provider } from "jotai";

export const JotaiProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return <Provider>{children}</Provider>;
};
