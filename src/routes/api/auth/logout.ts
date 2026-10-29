import { createFileRoute } from "@tanstack/react-router";
import { logoutHandler } from "@/server/api/auth";

export const Route = createFileRoute("/api/auth/logout")({
  server: { handlers: { POST: ({ request }) => logoutHandler(request) } },
});
