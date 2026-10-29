import { createFileRoute } from "@tanstack/react-router";
import { meHandler } from "@/server/api/auth";

export const Route = createFileRoute("/api/auth/me")({
  server: { handlers: { GET: ({ request }) => meHandler(request) } },
});
