import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateForm } from "./TemplateForm";
import { templatesRepo } from "@/services/repository";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/repository", async (orig) => ({ ...(await orig<object>()), templatesRepo: { save: vi.fn().mockResolvedValue({ id: "1" }), remove: vi.fn() } }));
afterEach(cleanup);

describe("TemplateForm", () => {
  it("valida, insere {{nome}} no cursor, mostra a prévia e cria o template", async () => {
    const onDone = vi.fn();
    render(<TemplateForm onDone={onDone} />);

    // Vazio: mostra os dois erros e não salva
    fireEvent.click(screen.getByRole("button", { name: /criar template/i }));
    expect(screen.getByText("Informe o nome do template.")).toBeTruthy();
    expect(screen.getByText("Escreva a mensagem do template.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Cobrança amigável" } });
    const area = screen.getByLabelText("Mensagem") as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "Oi , lembrete da fatura." } });
    area.setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole("button", { name: /\{\{nome\}\}/ }));
    expect(area.value).toBe("Oi {{nome}}, lembrete da fatura.");
    expect(screen.getByText("Oi Maria, lembrete da fatura.")).toBeTruthy(); // prévia

    // {{empresa}} não existe mais
    fireEvent.change(area, { target: { value: "Oi {{nome}} da {{empresa}}" } });
    fireEvent.click(screen.getByRole("button", { name: /criar template/i }));
    expect(screen.getByText(/Variável inválida/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.change(area, { target: { value: "Oi {{nome}}, lembrete da fatura." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /criar template/i }));
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 3000 });
    expect(templatesRepo.save).toHaveBeenCalledWith({ nome: "Cobrança amigável", conteudo: "Oi {{nome}}, lembrete da fatura." }, undefined);
  });
});
