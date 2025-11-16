import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_KEY!);

export default function TopicPage() {
  const { id } = useParams();
  const [topic, setTopic] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchTopic();
    fetchPosts();
  }, [id]);

  const fetchTopic = async () => {
    const { data } = await supabase.from("topics").select("*").eq("id", id).single();
    setTopic(data);
  };

  const fetchPosts = async () => {
    const { data } = await supabase.from("posts").select("*").eq("topic_id", id).order("id", { ascending: true });
    setPosts(data || []);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;

    const { error } = await supabase.from("posts").insert({
      topic_id: id,
      user_id: "00000000-0000-0000-0000-000000000000",
      content,
    });

    if (!error) {
      setContent("");
      fetchPosts();
    }
  };

  if (!topic) return <p className="p-4">Загрузка темы...</p>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{topic.title}</h1>
      <p className="text-gray-600 mb-6">{topic.content}</p>

      <h2 className="text-lg font-semibold mb-2">Ответить</h2>
      <Input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Ваше сообщение..."
        className="mb-2"
      />
      <Button onClick={handleSubmit}>Отправить</Button>

      <h2 className="text-lg font-semibold mt-8 mb-2">Ответы</h2>
      {posts.map((post) => (
        <Card key={post.id} className="mb-2">
          <CardContent className="p-4">
            <p>{post.content}</p>
            <p className="text-xs text-gray-400 mt-1">ID: {post.id}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
