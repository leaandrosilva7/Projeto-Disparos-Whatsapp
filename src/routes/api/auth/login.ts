import { createFileRoute } from "@tanstack/react-router";
import { loginHandler } from "@/server/api/auth";

export const Route = createFileRoute("/api/auth/login")({
  server: { handlers: { POST: ({ request }) => loginHandler(request) } },
});
