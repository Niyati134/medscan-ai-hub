import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

type Ctx = {
  activeMemberId: string | null; // null = Myself (account owner)
  setActiveMemberId: (id: string | null) => void;
};

const MemberContext = createContext<Ctx>({
  activeMemberId: null,
  setActiveMemberId: () => {},
});

const KEY = "medscan.activeMemberId";

export function MemberProvider({ children }: { children: ReactNode }) {
  const [activeMemberId, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(KEY);
    setActive(v && v !== "null" ? v : null);
  }, []);

  const setActiveMemberId = useCallback((id: string | null) => {
    setActive(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    }
  }, []);

  return (
    <MemberContext.Provider value={{ activeMemberId, setActiveMemberId }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  return useContext(MemberContext);
}
