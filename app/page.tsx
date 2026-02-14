"use client";

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

interface Bookmark {
  id: string;
  title: string;
  url: string;
  user_id: string;
  created_at: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

 useEffect(() => {
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const setupForUser = async (currentUser: User | null) => {
    setUser(currentUser);

    if (channel) {
      await supabase.removeChannel(channel);
      channel = null;
    }

    if (currentUser) {
      await fetchBookmarks(currentUser.id);

      channel = supabase
        .channel("bookmarks-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookmarks",
            filter: `user_id=eq.${currentUser.id}`,
          },
          (payload) => {
            console.log("Real-time update:", payload.eventType);

            if (payload.eventType === "INSERT" && payload.new) {
              const newBookmark = payload.new as Bookmark;
              setBookmarks((prev) => {
                const exists = prev.some((b) => b.id === newBookmark.id);
                if (exists) return prev;
                return [newBookmark, ...prev];
              });
            }

            if (payload.eventType === "DELETE" && payload.old) {
              setBookmarks((prev) =>
                prev.filter((b) => b.id !== payload.old.id)
              );
            }

            if (payload.eventType === "UPDATE" && payload.new) {
              setBookmarks((prev) =>
                prev.map((b) =>
                  b.id === payload.new.id ? (payload.new as Bookmark) : b
                )
              );
            }
          }
        )
        .subscribe();
    } else {
      setBookmarks([]);
    }
  };

  const init = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await setupForUser(session?.user ?? null);
    setLoading(false);
  };

  init();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    await setupForUser(session?.user ?? null);
    setLoading(false);
  });

  return () => {
    subscription.unsubscribe();
    if (channel) {
      supabase.removeChannel(channel);
    }
  };
}, []);

  const fetchBookmarks = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBookmarks(data || []);
    } catch (err) {
      console.error("Error fetching bookmarks:", err);
      setError("Failed to load bookmarks");
    }
  };

  const handleLogin = async () => {
    try {
      setError("");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      
      if (error) throw error;
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to sign in with Google");
    }
  };

  const handleLogout = async () => {
    try {
      setError("");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setBookmarks([]);

    } catch (err) {
      console.error("Logout error:", err);
      setError("Failed to sign out");
    }
  };

  const addBookmark = async () => {
    if (!title.trim() || !url.trim()) {
      setError("Please enter both title and URL");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL (e.g., https://example.com)");
      return;
    }

    if (!user) {
      setError("You must be logged in to add bookmarks");
      return;
    }

    try {
      setError("");
      
      // Just insert - let real-time handle the UI update
      const { error } = await supabase
        .from("bookmarks")
        .insert({
          title: title.trim(),
          url: url.trim(),
          user_id: user.id,
        });

      if (error) throw error;

      // Clear inputs
      setTitle("");
      setUrl("");
      
      // Real-time subscription will automatically add it to the UI
    } catch (err) {
      console.error("Error adding bookmark:", err);
      setError("Failed to add bookmark");
    }
  };

  const deleteBookmark = async (id: string) => {
    try {
      setError("");
      
      // Optimistic UI update - remove immediately
      setBookmarks(prev => prev.filter(b => b.id !== id));
      
      // Delete from database
      const { error } = await supabase.from("bookmarks").delete().eq("id", id);
      
      if (error) {
        // If error, refetch to restore correct state
        if (user) fetchBookmarks(user.id);
        throw error;
      }
    } catch (err) {
      console.error("Error deleting bookmark:", err);
      setError("Failed to delete bookmark");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addBookmark();
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
        <div className="text-white text-2xl font-semibold">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-6">
      {!user ? (
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-white mb-4">
            🔖 Smart Bookmarks
          </h1>
          <p className="text-white/90 text-lg mb-8">
            Save and organize your favorite links with real-time sync
          </p>
          <button
            onClick={handleLogin}
            className="px-8 py-4 bg-white text-black font-semibold rounded-xl shadow-lg hover:scale-105 transition duration-300"
          >
            🚀 Sign in with Google
          </button>
          {error && (
            <p className="text-red-200 bg-red-500/20 px-4 py-2 rounded-lg mt-4">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-white/20 backdrop-blur-lg rounded-2xl p-8 shadow-2xl text-white space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">
              🔖 {user.user_metadata?.full_name || user.email}&apos;s Bookmarks
            </h1>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition"
            >
              Logout
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-300/50 text-red-100 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="bg-white/20 p-4 rounded-xl space-y-3">
            <input
              type="text"
              placeholder="Bookmark Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={addBookmark}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition transform hover:scale-105"
            >
              ➕ Add Bookmark
            </button>
          </div>

          <div className="text-center text-white/80 text-sm">
            {bookmarks.length} {bookmarks.length === 1 ? "bookmark" : "bookmarks"} saved
          </div>

          <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
            {bookmarks.length === 0 && (
              <p className="text-center opacity-80">
                No bookmarks yet. Add your first one 🚀
              </p>
            )}

            {bookmarks.map((b) => (
              <div
                key={b.id}
                className="bg-white/20 p-4 rounded-xl flex justify-between items-center hover:scale-[1.02] transition duration-300"
              >
                <div className="flex-1 mr-4">
                  <p className="font-semibold">{b.title}</p>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-200 text-sm underline hover:text-blue-100 break-all"
                  >
                    {b.url}
                  </a>
                  <p className="text-xs text-white/60 mt-1">
                    {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteBookmark(b.id)}
                  className="text-red-300 hover:text-red-500 transition flex-shrink-0"
                  aria-label="Delete bookmark"
                >
                  ❌
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}