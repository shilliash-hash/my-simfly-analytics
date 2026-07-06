import { useEffect, useState } from "react";
import { getSupabaseInstance } from "@/lib/supabase"; // Dostosuj import do swojego projektu

export function useOnlineUsers(currentUsername: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    const supabase = getSupabaseInstance();
    if (!supabase || !currentUsername) return;

    // Tworzymy dedykowany kanał obecności w chmurze
    const channel = supabase.channel("hub-online-pilots", {
      config: { presence: { key: currentUsername } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // Wyciągamy unikalne nicki zalogowanych użytkowników
        const usernames = Object.keys(state);
        setOnlineUsers(usernames);
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
