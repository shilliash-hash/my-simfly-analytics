import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Tworzymy lekki, niezależny klient Realtime na podstawie zmiennych globalnych
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (window as any)._env_?.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (window as any)._env_?.VITE_SUPABASE_ANON_KEY || "";

const localRealtimeClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function useOnlineUsers(currentUsername: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    // Jeśli klient lub nick użytkownika nie są gotowe, przerywamy działanie
    if (!localRealtimeClient || !currentUsername) return;

    // Podpinamy kanał obecności WebSocket bezpośrednio przez natywną bibliotekę
    const channel = localRealtimeClient.channel("hub-online-pilots", {
      config: { presence: { key: currentUsername } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const usernames = Object.keys(state);
        setOnlineUsers(usernames);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUsername]);

  return onlineUsers;
}
