import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // Korzystamy z oficjalnego, globalnego klienta aplikacji

export function useOnlineUsers(currentUsername: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    // Pełne zabezpieczenie przed SSR i pustymi sesjami
    if (typeof window === "undefined" || !supabase || !currentUsername) return;

    // Podpinamy się pod główny kanał Realtime całej platformy
    const channel = supabase.channel("hub-online-pilots", {
      config: { 
        presence: { key: currentUsername } 
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const allPresentUsers: string[] = [];
        
        // Zliczamy wszystkie urządzenia i pilotów nadających na tym kanale
        Object.entries(state).forEach(([key, presences]: [string, any]) => {
          presences.forEach(() => {
            allPresentUsers.push(key);
          });
        });
        
        setOnlineUsers(allPresentUsers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Rozgłaszamy obecność tego urządzenia w głównej sieci
          await channel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUsername]);

  return onlineUsers;
}
