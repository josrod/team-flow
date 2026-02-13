import { LayoutDashboard, Users, CalendarDays, ArrowRightLeft, Zap, RotateCcw, Shield, Cpu, Rocket, Globe, Wrench, Database, Server, Download, Upload, type LucideIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
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
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { teams, resetData, exportData, importData } = useApp();
  const { t } = useLang();

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teamflow-backup-${new Date().toISOString().split("T")[0]}.json`;
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
    { title: teams[0]?.name || `${t.team} 1`, url: "/team/team-1", icon: getIcon(teams[0]?.icon) },
    { title: teams[1]?.name || `${t.team} 2`, url: "/team/team-2", icon: getIcon(teams[1]?.icon) },
    { title: t.absences, url: "/absences", icon: CalendarDays },
    { title: t.handovers, url: "/handovers", icon: ArrowRightLeft },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <h2 className="text-lg font-display font-bold tracking-tight text-sidebar-primary-foreground">
            ROSEN CUSW Team Flow
          </h2>
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
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Exportar JSON</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleImport}
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Importar JSON</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetData}
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset data</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
