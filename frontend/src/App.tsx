import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { FeatureGate } from './components/plan/FeatureGate'
import { NotFoundPage } from './pages/NotFoundPage'
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { CheckoutPage } from './pages/checkout/CheckoutPage'
import { AccountDeletionPage } from './pages/legal/AccountDeletionPage'
import { PrivacyPolicyPage } from './pages/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/legal/TermsOfServicePage'
import { AgendaPage } from './pages/panel/AgendaPage'
import { ClientDetailPage } from './pages/panel/ClientDetailPage'
import { ClientsPage } from './pages/panel/ClientsPage'
import { DashboardPage } from './pages/panel/DashboardPage'
import { EmployeesPage } from './pages/panel/EmployeesPage'
import { FinancePage } from './pages/panel/FinancePage'
import { MarketingPage } from './pages/panel/MarketingPage'
import { ReportsPage } from './pages/panel/ReportsPage'
import { ServicesPage } from './pages/panel/ServicesPage'
import { SettingsPage } from './pages/panel/SettingsPage'
import { StockPage } from './pages/panel/StockPage'
import { PublicBookingPage } from './pages/public/PublicBookingPage'
import { PublicManageBookingPage } from './pages/public/PublicManageBookingPage'
import { PermissionRoute } from './routes/PermissionRoute'
import { ProtectedRoute } from './routes/ProtectedRoute'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* Aceite do convite da equipe: quem chega aqui ainda não tem conta. */}
        <Route path="/convite" element={<AcceptInvitePage />} />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
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
          {/* O dashboard não tem gate: é a página de entrada de qualquer sessão
              (o próprio conteúdo se adapta ao que a pessoa pode ver), e é para
              onde o PermissionRoute manda quem tenta abrir o que não pode. */}
          <Route index element={<DashboardPage />} />
          <Route
            path="agenda"
            element={
              <PermissionRoute permission="agenda.view">
                <AgendaPage />
              </PermissionRoute>
            }
          />
          <Route
            path="clientes"
            element={
              <PermissionRoute permission="clients.view">
                <ClientsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="clientes/:id"
            element={
              <PermissionRoute permission="clients.view">
                <ClientDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="estoque"
            element={
              <PermissionRoute permission="stock.view">
                <FeatureGate feature="estoque">
                  <StockPage />
                </FeatureGate>
              </PermissionRoute>
            }
          />
          <Route
            path="fidelidade"
            element={
              <PermissionRoute permission="marketing.view">
                <MarketingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="relatorios"
            element={
              <PermissionRoute permission="reports.view">
                <FeatureGate feature="relatorios">
                  <ReportsPage />
                </FeatureGate>
              </PermissionRoute>
            }
          />
          <Route
            path="financeiro"
            element={
              <PermissionRoute permission="finance.view">
                <FeatureGate feature="financeiro">
                  <FinancePage />
                </FeatureGate>
              </PermissionRoute>
            }
          />
          <Route
            path="servicos"
            element={
              <PermissionRoute permission="services.manage">
                <ServicesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="funcionarios"
            element={
              <PermissionRoute permission="employees.view">
                <EmployeesPage />
              </PermissionRoute>
            }
          />
          {/* Sem gate: a aba Conta (senha própria) vale para todo mundo; cada
              aba de dentro se esconde sozinha conforme a permissão. */}
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        {/* Antes de "/:slug": o segmento fixo tem prioridade e evita que
            "editagendamento" seja lido como slug de estabelecimento. */}
        <Route path="/:slug/editagendamento" element={<PublicManageBookingPage />} />
        <Route path="/:slug" element={<PublicBookingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
