import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, LayoutDashboard, LogOut, Megaphone, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { NumeroSidebarItem } from "@/components/NumeroSidebarItem";
import { authService } from "@/services/integrations";
import { getCurrentUser } from "@/services/session";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_painel")({
  // Sem sessão válida no servidor, ninguém entra no painel.
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/" });
    return { user };
  },
  component: Layout,
});

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Campanhas", url: "/campanhas", icon: Megaphone },
  { title: "Templates", url: "/templates", icon: FileText },
  { title: "Grupos de Contatos", url: "/grupos", icon: Users },
] as const;

function Layout() {
  const navigate = useNavigate();
  const sair = async () => {
    try {
      await authService.logout();
    } finally {
      await navigate({ to: "/" });
    }
  };
  const { user } = Route.useRouteContext();
  const menu = user.role === "ADMIN" ? [...items, { title: "Usuários", url: "/usuarios", icon: ShieldCheck }] : items;
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-1 py-2">
              <MessageSquare className="h-5 w-5 shrink-0 text-sidebar-primary-foreground" />
              <span className="truncate font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">Disparador WhatsApp</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menu.map((i) => (
                    <SidebarMenuItem key={i.url}>
                      <SidebarMenuButton asChild isActive={path === i.url} tooltip={i.title}>
                        <Link to={i.url}><i.icon /><span>{i.title}</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarSeparator />
            <SidebarMenu>
              <NumeroSidebarItem />
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Sair" onClick={() => void sair()}>
                  <LogOut /><span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-card px-3">
            <SidebarTrigger />
            <ThemeToggle />
          </header>
          <main className="flex-1 p-6"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
