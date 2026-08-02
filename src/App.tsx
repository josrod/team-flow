import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { AdminRoute } from "@/components/AdminRoute";
import { AuthedRoute } from "@/components/AuthedRoute";
import { AppLayout } from "@/components/AppLayout";
import { TeamPulseDashboard } from "@/components/TeamPulseDashboard";
import Index from "./pages/Index";
import TeamPage from "./pages/TeamPage";
import AbsencesPage from "./pages/AbsencesPage";
import HandoversPage from "./pages/HandoversPage";
import FeaturesPage from "./pages/FeaturesPage";
import TasksPage from "./pages/TasksPage";
import AzureDevOpsSettingsPage from "./pages/AzureDevOpsSettingsPage";
import { BugsPage } from "./pages/BugsPage";
import { EpicsPage } from "./pages/EpicsPage";
import { WaitingPage } from "./pages/WaitingPage";

import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <LanguageProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  {/* Signed-in pages (team data requires a session) */}
                  <Route path="/" element={<AuthedRoute><AppLayout><Index /></AppLayout></AuthedRoute>} />
                  <Route path="/team/:teamId" element={<AuthedRoute><AppLayout><TeamPage /></AppLayout></AuthedRoute>} />
                  <Route path="/handovers" element={<AuthedRoute><AppLayout><HandoversPage /></AppLayout></AuthedRoute>} />
                  <Route path="/tasks" element={<AuthedRoute><AppLayout><TasksPage /></AppLayout></AuthedRoute>} />
                  <Route path="/bugs" element={<AuthedRoute><AppLayout><BugsPage /></AppLayout></AuthedRoute>} />
                  <Route path="/waiting" element={<AuthedRoute><AppLayout><WaitingPage /></AppLayout></AuthedRoute>} />
                  <Route path="/epics" element={<AuthedRoute><AppLayout><EpicsPage /></AppLayout></AuthedRoute>} />
                  <Route path="/pulse" element={<AuthedRoute><AppLayout><TeamPulseDashboard /></AppLayout></AuthedRoute>} />
                  <Route path="/features" element={<AuthedRoute><AppLayout><FeaturesPage view="features" /></AppLayout></AuthedRoute>} />
                  <Route path="/absences" element={<AuthedRoute><AppLayout><AbsencesPage /></AppLayout></AuthedRoute>} />
                  <Route path="/workload" element={<AuthedRoute><AppLayout><FeaturesPage view="workload" /></AppLayout></AuthedRoute>} />
                  {/* Admin-only pages */}
                  <Route path="/settings/azure-devops" element={<AdminRoute><AppLayout><AzureDevOpsSettingsPage /></AppLayout></AdminRoute>} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppProvider>
            </AuthProvider>
          </BrowserRouter>
        </LanguageProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
