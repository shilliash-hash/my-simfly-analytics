import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useOnlineUsers(currentUsername: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    // Sprawdzamy czy obiekt supabase oraz nazwa użytkownika są gotowe
    if (!supabase || !currentUsername) return;

    // Tworzymy dedykowany kanał obecności w chmurze
    const channel = supabase.channel("hub-online-pilots", {
      config: { presence: { key: currentUsername } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // Wyciągamy unikalne nicki zalogowanych użytkowników z kluczy stanu
        const usernames = Object.keys(state);
        setOnlineUsers(usernames);
      })
      .on("presence", { event: "join" }, ({ key, currentPresences }) => {
        console.log(`[Presence] Pilot ${key} entered the Hub`);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        console.log(`[Presence] Pilot ${key} disconnected`);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Rozgłaszamy obecność aktualnego użytkownika
          await channel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUsername]);

  return onlineUsers;
}
