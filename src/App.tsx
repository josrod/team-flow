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
import { DigestPage } from "./pages/DigestPage";


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
                  {/* Public read-only pages (writes are admin-only in the UI) */}
                  <Route path="/" element={<AppLayout><Index /></AppLayout>} />
                  <Route path="/team/:teamId" element={<AppLayout><TeamPage /></AppLayout>} />
                  <Route path="/handovers" element={<AppLayout><HandoversPage /></AppLayout>} />
                  <Route path="/tasks" element={<AppLayout><TasksPage /></AppLayout>} />
                  <Route path="/bugs" element={<AppLayout><BugsPage /></AppLayout>} />
                  <Route path="/waiting" element={<AppLayout><WaitingPage /></AppLayout>} />
                  <Route path="/digest" element={<AppLayout><DigestPage /></AppLayout>} />
                  <Route path="/epics" element={<AppLayout><EpicsPage /></AppLayout>} />
                  <Route path="/pulse" element={<AppLayout><TeamPulseDashboard /></AppLayout>} />
                  <Route path="/features" element={<AppLayout><FeaturesPage view="features" /></AppLayout>} />
                  <Route path="/absences" element={<AppLayout><AbsencesPage /></AppLayout>} />
                  <Route path="/workload" element={<AppLayout><FeaturesPage view="workload" /></AppLayout>} />

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
