import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import TeamPage from "./pages/TeamPage";
import AbsencesPage from "./pages/AbsencesPage";
import HandoversPage from "./pages/HandoversPage";
import AzureDevOpsSettingsPage from "./pages/AzureDevOpsSettingsPage";
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
                  <Route path="/" element={<ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute>} />
                  <Route path="/team/:teamId" element={<ProtectedRoute><AppLayout><TeamPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/absences" element={<ProtectedRoute><AppLayout><AbsencesPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/handovers" element={<ProtectedRoute><AppLayout><HandoversPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/settings/azure-devops" element={<ProtectedRoute><AppLayout><AzureDevOpsSettingsPage /></AppLayout></ProtectedRoute>} />
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
