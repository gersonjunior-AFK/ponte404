import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/ponte-app";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Entrar — Ponte 404" },
    { name: "description", content: "Entre na Ponte 404 e encontre novas oportunidades de aprender e ensinar." },
    { property: "og:title", content: "Entrar — Ponte 404" },
    { property: "og:description", content: "Conhecimento encontra quem precisa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: LoginPage,
});
