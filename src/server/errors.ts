/**
 * Erro "esperado" da aplicação: a mensagem é segura para ser exibida ao usuário.
 * Qualquer outro erro é tratado como interno e nunca tem o texto devolvido ao cliente.
 */
export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "dados_invalidos") => new AppError(400, code, message);
export const unauthorized = (message = "Sessão inválida ou expirada. Entre novamente.") =>
  new AppError(401, "nao_autenticado", message);
export const forbidden = (message = "Você não tem permissão para esta ação.") => new AppError(403, "sem_permissao", message);
export const notFound = (message = "Recurso não encontrado.") => new AppError(404, "nao_encontrado", message);
export const conflict = (message: string, code = "conflito") => new AppError(409, code, message);
