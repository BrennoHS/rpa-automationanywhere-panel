import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { T } from "./constants/theme";

// Cada tela só baixa quando alguém navega até ela - sem isso, abrir só o
// Dashboard já baixava o código de TODAS as telas (inclusive ServiceNow, que
// puxa o exceljs) de uma vez só, inflando o carregamento inicial à toa.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Robots = lazy(() => import("./pages/Robots").then((m) => ({ default: m.Robots })));
const Schedule = lazy(() => import("./pages/Schedule").then((m) => ({ default: m.Schedule })));
const Alerts = lazy(() => import("./pages/Alerts").then((m) => ({ default: m.Alerts })));
const ServiceNow = lazy(() => import("./pages/ServiceNow").then((m) => ({ default: m.ServiceNow })));

/** Fallback do Suspense enquanto o código da tela ainda está baixando - rápido o bastante (cache do navegador depois da 1a vez) pra não precisar de skeleton elaborado. */
function RouteFallback() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
      Carregando…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="robots"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Robots />
              </Suspense>
            }
          />
          <Route
            path="schedule"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Schedule />
              </Suspense>
            }
          />
          <Route
            path="alerts"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Alerts />
              </Suspense>
            }
          />
          <Route
            path="servicenow"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ServiceNow />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
