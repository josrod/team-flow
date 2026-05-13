import { LayoutDashboard, Users, CalendarDays, ArrowRightLeft, RotateCcw, Shield, Cpu, Rocket, Globe, Wrench, Database, Server, Download, Upload, Settings, LogOut, Layers, ListChecks, type LucideIcon } from "lucide-react";
import cuswLogo from "@/assets/cusw-logo.png";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { teams, resetData, exportData, importData } = useApp();
  const { t } = useLang();
  const { signOut, user } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}${String(now.getSeconds()).padStart(2,"0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `teamflow-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!window.confirm("¿Estás seguro? Esto sobrescribirá todos los datos actuales con los del archivo seleccionado.")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          importData(ev.target?.result as string);
        } catch {
          // toast handled inside importData
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const iconMap: Record<string, LucideIcon> = { shield: Shield, cpu: Cpu, rocket: Rocket, globe: Globe, wrench: Wrench, database: Database, server: Server, users: Users };
  const getIcon = (key?: string) => iconMap[key || ""] || Users;
  const navItems = [
    { title: t.dashboard, url: "/", icon: LayoutDashboard },
    ...teams.map((team) => ({
      title: team.name,
      url: `/team/${team.id}`,
      icon: getIcon(team.icon),
    })),
    { title: t.absences, url: "/absences", icon: CalendarDays },
    { title: t.handovers, url: "/handovers", icon: ArrowRightLeft },
    { title: t.features, url: "/features", icon: Layers },
    { title: t.tasks, url: "/tasks", icon: ListChecks },
    { title: t.workload, url: "/workload", icon: CalendarDays },
    { title: "Azure DevOps", url: "/settings/azure-devops", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={cuswLogo} alt="CUSW Logo" className="h-9 w-9 rounded-lg object-cover shrink-0" />
          {!isCollapsed && (
            <h2 className="text-sm font-display font-bold tracking-tight text-sidebar-primary-foreground leading-tight">
              ROSEN CUSW<br />
              <span className="text-[10px] font-normal text-sidebar-foreground/60 tracking-widest uppercase">Team Flow</span>
            </h2>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-widest font-semibold">
            {t.navigation}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent transition-colors rounded-lg"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          title="Exportar JSON"
          className={cn("w-full gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs", isCollapsed ? "justify-center px-0" : "justify-start")}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          {!isCollapsed && <span>Exportar JSON</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleImport}
          title="Importar JSON"
          className={cn("w-full gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs", isCollapsed ? "justify-center px-0" : "justify-start")}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          {!isCollapsed && <span>Importar JSON</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetData}
          title="Reset data"
          className={cn("w-full gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs", isCollapsed ? "justify-center px-0" : "justify-start")}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          {!isCollapsed && <span>Reset data</span>}
        </Button>
        {user && (
          <div className="pt-2 border-t border-sidebar-border mt-2">
            {!isCollapsed && (
              <p className="text-[10px] text-sidebar-foreground/50 truncate px-2 mb-1">{user.email}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              title={t.authLogout}
              className={cn("w-full gap-2 text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent text-xs", isCollapsed ? "justify-center px-0" : "justify-start")}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              {!isCollapsed && <span>{t.authLogout}</span>}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
