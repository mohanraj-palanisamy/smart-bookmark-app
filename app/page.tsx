"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Bookmark = {
  id: string;
  title: string;
  url: string;
  user_id: string;
  created_at: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupUser = async (currentUser: User | null) => {
      if (!currentUser) {
        setUser(null);
        setBookmarks([]);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      // Fetch bookmarks
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch error:", error);
      } else {
        setBookmarks(data || []);
      }

      // Setup realtime
      channel = supabase
        .channel("bookmarks-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookmarks",
            filter: `user_id=eq.${currentUser.id}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setBookmarks((prev) => [
                payload.new as Bookmark,
                ...prev,
              ]);
            }

            if (payload.eventType === "DELETE") {
              setBookmarks((prev) =>
                prev.filter((b) => b.id !== payload.old.id)
              );
            }

            if (payload.eventType === "UPDATE") {
              setBookmarks((prev) =>
                prev.map((b) =>
                  b.id === payload.new.id
                    ? (payload.new as Bookmark)
                    : b
                )
              );
            }
          }
        )
        .subscribe();

      setLoading(false);
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await setupUser(session?.user ?? null);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setupUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBookmarks([]);
  };

  const addBookmark = async () => {
    if (!title || !url || !user) return;

    setError("");

    const { error } = await supabase.from("bookmarks").insert([
      {
        title,
        url,
        user_id: user.id,
      },
    ]);

    if (error) {
      setError("Failed to add bookmark");
      console.error(error);
    } else {
      setTitle("");
      setUrl("");
    }
  };

  const deleteBookmark = async (id: string) => {
    await supabase.from("bookmarks").delete().eq("id", id);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-xl">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 text-white">
        <h1 className="text-3xl font-bold mb-6">
          Smart Bookmark App
        </h1>
        <button
          onClick={handleLogin}
          className="bg-white text-black px-6 py-2 rounded-lg font-semibold"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Bookmarks</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6">
        <input
          type="text"
          placeholder="Bookmark Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border p-2 w-full mb-2"
        />
        <input
          type="text"
          placeholder="Bookmark URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border p-2 w-full mb-2"
        />
        <button
          onClick={addBookmark}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Bookmark
        </button>
        {error && (
          <p className="text-red-500 mt-2">{error}</p>
        )}
      </div>

      <div className="space-y-3">
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="bg-white p-4 rounded shadow flex justify-between items-center"
          >
            <a
              href={bookmark.url}
              target="_blank"
              className="text-blue-600 underline"
            >
              {bookmark.title}
            </a>
            <button
              onClick={() => deleteBookmark(bookmark.id)}
              className="text-red-500"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
