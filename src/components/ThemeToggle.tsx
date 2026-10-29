import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "theme";

/**
 * Alterna entre tema claro e escuro e persiste a escolha no localStorage.
 * O tema inicial é aplicado por um script no <head> (ver __root.tsx), então
 * os ícones usam variantes `dark:` do CSS em vez de estado, evitando
 * diferença entre servidor e cliente na hidratação.
 */
export function ThemeToggle() {
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    } catch {
      /* localStorage indisponível (ex.: modo privado): o tema vale só nesta sessão */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar tema"
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
