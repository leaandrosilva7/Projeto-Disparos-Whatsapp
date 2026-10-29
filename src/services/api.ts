/** Cliente HTTP da API própria. Cookies de sessão vão automaticamente (mesma origem); nenhum token fica no JavaScript. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : {},
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiError(0, "rede", "Sem conexão com o servidor. Tente novamente.");
  }
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  // Sessão expirada/encerrada: volta ao login (exceto na própria tentativa de login).
  if (res.status === 401 && !path.startsWith("/api/auth/login") && typeof window !== "undefined") window.location.assign("/");
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "erro", data?.error?.message ?? "Não foi possível concluir a ação.");
  return data as T;
}
