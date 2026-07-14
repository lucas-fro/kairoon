import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { AccountDeletionPage } from './pages/legal/AccountDeletionPage'
import { PrivacyPolicyPage } from './pages/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/legal/TermsOfServicePage'
import { AgendaPage } from './pages/panel/AgendaPage'
import { ClientDetailPage } from './pages/panel/ClientDetailPage'
import { ClientsPage } from './pages/panel/ClientsPage'
import { DashboardPage } from './pages/panel/DashboardPage'
import { FinancePage } from './pages/panel/FinancePage'
import { MarketingPage } from './pages/panel/MarketingPage'
import { ReportsPage } from './pages/panel/ReportsPage'
import { SettingsPage } from './pages/panel/SettingsPage'
import { StockPage } from './pages/panel/StockPage'
import { PublicBookingPage } from './pages/public/PublicBookingPage'
import { ProtectedRoute } from './routes/ProtectedRoute'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/termos-de-uso" element={<TermsOfServicePage />} />
        <Route path="/exclusao-de-conta" element={<AccountDeletionPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/:id" element={<ClientDetailPage />} />
          <Route path="estoque" element={<StockPage />} />
          <Route path="fidelidade" element={<MarketingPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          {/* Serviços agora vivem dentro de Configurações (aba própria) */}
          <Route
            path="servicos"
            element={<Navigate to="/app/configuracoes?tab=servicos" replace />}
          />
          <Route
            path="funcionarios"
            element={<Navigate to="/app/configuracoes?tab=funcionarios" replace />}
          />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/:slug" element={<PublicBookingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
