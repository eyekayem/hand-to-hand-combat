import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { CanonicalUrl } from "./components/CanonicalUrl";
import { lazy, Suspense } from "react";

// Studio pulls in three.js; keep it out of the arena's first load.
const GestureStudio = lazy(() => import("./pages/GestureStudio"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <CanonicalUrl />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route
            path="/studio"
            element={
              <Suspense fallback={<div className="h-screen flex items-center justify-center text-sm text-muted-foreground">Loading Studio…</div>}>
                <GestureStudio />
              </Suspense>
            }
          />
          <Route path="/blocking" element={<Navigate to="/studio" replace />} />
          <Route path="/trainer" element={<Navigate to="/studio" replace />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
