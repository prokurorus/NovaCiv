import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

export default function ForumPage() {
  const [sections, setSections] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    fetchSections();
    fetchTopics();
  }, []);

  const fetchSections = async () => {
    const { data, error } = await supabase.from("sections").select("*");
    if (!error) setSections(data);
  };

  const fetchTopics = async () => {
    const { data, error } = await supabase.from("topics").select("*").order("id", { ascending: false });
    if (!error) setTopics(data);
  };

  const handleSubmit = async () => {
    if (!selectedSection || !title || !content) return;

    const { error } = await supabase.from("topics").insert([
      {
        section_id: parseInt(selectedSection),
        user_id: "00000000-0000-0000-0000-000000000000",
        title,
        content,
      },
    ]);

    if (!error) {
      setTitle("");
      setContent("");
      setSelectedSection("");
      fetchTopics();
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Форум NovaCiv</h1>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Новая тема</h2>
        <Select onValueChange={setSelectedSection} value={selectedSection}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите раздел" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id.toString()}>
                {section.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Содержание" value={content} onChange={(e) => setContent(e.target.value)} />

        <Button onClick={handleSubmit}>Создать тему</Button>
      </div>

      <div className="mt-10 space-y-4">
        <h2 className="text-xl font-bold">Темы форума</h2>
        {topics.map((topic) => (
  <Card key={topic.id}>
    <CardContent className="p-4">
      <Link to={`/topic/${topic.id}`}>
        <h3 className="font-semibold text-blue-600 hover:underline">
          {topic.title}
        </h3>
      </Link>
      <p className="text-gray-600">{topic.content}</p>
      <p className="text-xs text-gray-400 mt-1">ID темы: {topic.id}</p>
    </CardContent>
  </Card>
))}

      </div>
    </div>
  );
}
