import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useLang } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import cuswLogo from "@/assets/cusw-logo.png";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthPage() {
  const { signIn, signUp, user, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  React.useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      toast.success(t.authLoginSuccess);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword.length < 6) {
      toast.error(t.authPasswordMin);
      return;
    }
    setLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupName);
      toast.success(t.authSignupSuccess);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(forgotEmail);
      toast.success(t.authResetSent);
      setMode("login");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const fadeVariants = {
    initial: { opacity: 0, y: 8, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  };

  const inputClasses =
    "h-11 bg-muted/40 border-border/60 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-offset-0 focus-visible:border-ring/40 transition-all duration-200";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:py-4">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[380px]"
      >
        {/* Logo + brand */}
        <div className="mb-5 sm:mb-8 flex flex-col items-center gap-2.5">
          <motion.div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border/60 shadow-sm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={cuswLogo}
              alt="CUSW"
              className="h-9 w-9 rounded-lg object-cover"
            />
          </motion.div>
          <div className="text-center">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              TeamFlow
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.authSubtitle}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card shadow-md overflow-hidden">
          <AnimatePresence mode="wait">
            {mode === "forgot" ? (
              <motion.div
                key="forgot"
                variants={fadeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="p-6"
              >
                <div className="mb-5">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    {t.authResetPassword}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.authResetDesc}
                  </p>
                </div>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                      className={inputClasses}
                    />
                  </div>
                  <Button type="submit" className="w-full h-10" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t.authSendReset}
                  </Button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                    onClick={() => setMode("login")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t.authBackToLogin}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="auth"
                variants={fadeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Tab switcher */}
                <div className="flex border-b border-border/60">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`flex-1 py-3 text-sm font-medium transition-all duration-200 relative ${
                      mode === "login"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground/70"
                    }`}
                  >
                    {t.authLogin}
                    {mode === "login" && (
                      <motion.div
                        layoutId="auth-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`flex-1 py-3 text-sm font-medium transition-all duration-200 relative ${
                      mode === "signup"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground/70"
                    }`}
                  >
                    {t.authSignup}
                    {mode === "signup" && (
                      <motion.div
                        layoutId="auth-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}
                  </button>
                </div>

                <div className="p-6">
                  <AnimatePresence mode="wait">
                    {mode === "login" ? (
                      <motion.form
                        key="login-form"
                        variants={fadeVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onSubmit={handleLogin}
                        className="space-y-4"
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor="login-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Email
                          </Label>
                          <Input
                            id="login-email"
                            type="email"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            placeholder="you@company.com"
                            className={inputClasses}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="login-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t.authPassword}
                          </Label>
                          <div className="relative">
                            <Input
                              id="login-password"
                              type={showPassword ? "text" : "password"}
                              required
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              placeholder="••••••••"
                              className={`${inputClasses} pr-10`}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors duration-200"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-10 font-medium active:scale-[0.98] transition-transform"
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {t.authLogin}
                          <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Button>
                        <button
                          type="button"
                          className="w-full text-center text-sm text-muted-foreground/70 hover:text-foreground transition-colors duration-200"
                          onClick={() => setMode("forgot")}
                        >
                          {t.authForgotPassword}
                        </button>
                      </motion.form>
                    ) : (
                      <motion.form
                        key="signup-form"
                        variants={fadeVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onSubmit={handleSignup}
                        className="space-y-4"
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t.name}
                          </Label>
                          <Input
                            id="signup-name"
                            type="text"
                            value={signupName}
                            onChange={(e) => setSignupName(e.target.value)}
                            placeholder={t.authNamePlaceholder}
                            className={inputClasses}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Email
                          </Label>
                          <Input
                            id="signup-email"
                            type="email"
                            required
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            placeholder="you@company.com"
                            className={inputClasses}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t.authPassword}
                          </Label>
                          <div className="relative">
                            <Input
                              id="signup-password"
                              type={showPassword ? "text" : "password"}
                              required
                              minLength={6}
                              value={signupPassword}
                              onChange={(e) => setSignupPassword(e.target.value)}
                              placeholder="••••••••"
                              className={`${inputClasses} pr-10`}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors duration-200"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-10 font-medium active:scale-[0.98] transition-transform"
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {t.authSignup}
                          <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          ROSEN CUSW · TeamFlow
        </p>
      </motion.div>
    </div>
  );
}
