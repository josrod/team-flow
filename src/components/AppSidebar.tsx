import { LayoutDashboard, Users, CalendarDays, ArrowRightLeft } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Equipo Alpha", url: "/team/team-1", icon: Users },
  { title: "Equipo Beta", url: "/team/team-2", icon: Users },
  { title: "Ausencias", url: "/absences", icon: CalendarDays },
  { title: "Handovers", url: "/handovers", icon: ArrowRightLeft },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <h2 className="text-lg font-bold tracking-tight text-sidebar-foreground">
          Team Flow
        </h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
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
    </Sidebar>
  );
}
