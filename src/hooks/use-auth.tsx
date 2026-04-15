import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    session: null,
    isLoading: true,
  });

  useEffect(() => {
    // Skip auth on server — no localStorage/cookies available
    if (typeof window === "undefined") {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          isAuthenticated: !!session?.user,
          user: session?.user ?? null,
          session,
          isLoading: false,
        });
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        isAuthenticated: !!session?.user,
        user: session?.user ?? null,
        session,
        isLoading: false,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { ...state, signOut };
}
