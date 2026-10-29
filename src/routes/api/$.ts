import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/api/router";

/** Todas as demais rotas /api/* (login/logout/me têm arquivos próprios). O despachante exige sessão e papel. */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => apiHandler(request),
      POST: ({ request }) => apiHandler(request),
      PUT: ({ request }) => apiHandler(request),
      PATCH: ({ request }) => apiHandler(request),
      DELETE: ({ request }) => apiHandler(request),
    },
  },
});
