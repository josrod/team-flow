import { LayoutDashboard, Users, CalendarDays, ArrowRightLeft, Zap, RotateCcw } from "lucide-react";
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
  const { teams, resetData } = useApp();
  const { t } = useLang();

  const navItems = [
    { title: t.dashboard, url: "/", icon: LayoutDashboard },
    { title: teams[0]?.name || `${t.team} 1`, url: "/team/team-1", icon: Users },
    { title: teams[1]?.name || `${t.team} 2`, url: "/team/team-2", icon: Users },
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
            Team Flow
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
      <SidebarFooter className="p-3 border-t border-sidebar-border">
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
